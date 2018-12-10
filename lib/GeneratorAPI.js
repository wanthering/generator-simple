const path = require('path')
const globby = require('globby')
const isBinary = require('isbinaryfile')
const fs = require('fs-extra')
const ejs = require('ejs')

module.exports = class GeneratorAPI{
  constructor(id, generator, options){
    this.id = id
    this.generator = generator
    this.options = options
  }

  render(source, additionalData){
    // 获取render()函数的文件存放的文件夹位置，与source拼接目录。
    // 测试文件中得到generator-simple/lib/__test__/template
    const baseDir = extractCallDir()

    this._injectFileMiddleware(async files=>{
      // 把options上的参数与additionalData挂载在一起
      const data = this._resolveData(additionalData)

      source = path.resolve(baseDir,source)

      const _files = await globby('**/*',{cwd:source})

      for( const rawPath of _files ){
        let filename = path.basename(rawPath)
        // 发布Npm包时候，所有隐藏文件都会被忽略，所以模板中需要写成'_gitignore'，才能还原成'.ignore'
        if (filename.charAt(0) === '_' && filename.charAt(1) !== '_') {
          filename = `.${filename.slice(1)}`
        }
        if (filename.charAt(0) === '_' && filename.charAt(1) === '_') {
          filename = `${filename.slice(1)}`
        }
        const targetPath = path.join(path.dirname(rawPath), filename)
        const sourcePath = path.resolve(source, rawPath)
        const content = renderFile(sourcePath,data)
        // 写入时跳过空文件，必须为Buffer或有内容。
        if(Buffer.isBuffer(content) || /[^\s]/.test(content)){
          files[targetPath] = content
        }
      }
    })
  }



  /**
   * 函数目的：把options上的对象和render中第二个参数传入的对象挂载到一起
   * 示例：    测试代码中生成的data为： {options:{n:1},m:2}
   * @private
   */
  _resolveData(additionalData){
    return Object.assign({
      options: this.options,
    }, additionalData)
  }


  /**
   * 函数目的： 把middleware推入
   * @param middleware  为异步函数数组
   * @private
   */
  _injectFileMiddleware(middleware){
    // 将middleware推入fileMiddlewares数组
    this.generator.fileMiddlewares.push(middleware)
  }

}

/**
 * 函数目的： 获取render()函数调取的文件所存放的文件夹
 * 示例：    测试中，就是在`generator-simple/lib/__test__/`下调用的，所以返回它
 * 实现方法： 实现采用黑科技，通过模拟一个报错，报错会打印报错文件位置，从报错文件位置中抽取出render的文件位置。
 * @returns {string} render()调取的文件夹位置
 */
function extractCallDir () {
  // extract api.render() callsite file location using error stack
  const obj = {}
  Error.captureStackTrace(obj)
  const callSite = obj.stack.split('\n')[3]
  const fileName = callSite.match(/\s\((.*):\d+:\d+\)$/)[1]
  return path.dirname(fileName)
}


function renderFile(path,data){
  if(isBinary.sync(path)){
    return fs.readFileSync(path)
  }
  const template = fs.readFileSync(path, 'utf-8')
  return ejs.render(template,data)
}
