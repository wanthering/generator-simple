const path = require('path')
const globby = require('globby')
const isBinary = require('isbinaryfile')
const fs = require('fs-extra')
const ejs = require('ejs')
const merge = require('deepmerge')
const mergeDeps = require('merge-dependencies')
const mergeArrayWithDedupe = (a, b) => Array.from(new Set([...a, ...b]))
const ConfigPool = require('config-pool')



module.exports = class GeneratorAPI {
  constructor(id, generator, options) {
    this.id = id
    this.generator = generator
    this.options = options
  }

  /**
   * 函数目的： 创建一个异步函数，用于对files进行解析
   * 函数实现：
   *         -source为字符串，则遍历目录，将得到的路径和数据输入_renderFile
   *         -source为对象，则遍历对象，将得到的路径和数据输入_renderFile
   *         _source为函数，直接作为middleware传入
   * @param source
   * @param additionalData
   */
  render(source, additionalData) {
    // 获取render()函数的文件存放的文件夹位置，与source拼接目录。
    // 测试文件中得到generator-simple/lib/__test__/template
    const baseDir = extractCallDir()

    if (typeof source === 'string') {
      this._injectFileMiddleware(async files => {
        // 把options上的参数与additionalData挂载在一起
        const data = this._resolveData(additionalData)

        source = path.resolve(baseDir, source)

        const _files = await globby('**/*', { cwd: source })
        for (const rawPath of _files) {
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
          const content = renderFile(sourcePath, data)
          // 写入时跳过空文件，必须为Buffer或有内容。
          if (Buffer.isBuffer(content) || content.trim()) {
            files[targetPath] = content
          }
        }
      })
    } else if (typeof source === 'object') {
      this._injectFileMiddleware(files => {
        const data = this._resolveData(additionalData)

        // 遍历映射对象
        Object.keys(source).forEach((targetPath) => {
          const sourcePath = source[targetPath]
          const content = renderFile(sourcePath, data)
          // 写入时跳过空文件，必须为Buffer或有内容。
          if (Buffer.isBuffer(content) || content.trim()) {
            files[targetPath] = content
          }
        })
      })
    } else if (typeof source === 'function') {
      this._injectFileMiddleware(source)
    }
  }

  get entryFile () {
    return  fs.existsSync(this.resolve('src/main.ts')) ? 'src/main.ts' : 'src/main.js'
  }


  /**
   *  函数目的： 合并package.json文件内数据
   *  实现原理： 遍历新增对象的每个field，和原来存在的field做对比
   *            运用无则新增、有则更新、数组合并、对象回调
   * @param fields
   */
  extendPackage(fields) {
    const pkg = this.generator.pkg
    const toMerge = typeof fields === 'function' ? fields(pkg) : fields
    Object.keys(toMerge).forEach((key) => {
      const updateField = toMerge[key]
      const existField = pkg[key]
      if (typeof updateField === 'object' && (key === 'dependencies' || key === 'devDependencies')) {
        // 单独处理包依赖

        pkg[key] = mergeDeps(
          this.id,
          existField || {},
          updateField
        )
      } else if (!(key in pkg)) {
        //无则新增
        pkg[key] = updateField
      } else if (Array.isArray(updateField) && Array.isArray(existField)) {
        //数组合并
        pkg[key] = mergeArrayWithDedupe(existField, updateField)
      } else if (typeof updateField === 'object' && typeof existField === 'object') {
        // 对象回调
        pkg[key] = merge(existField, updateField, { arrayMerge: mergeArrayWithDedupe })
      } else {
        // 有则更新
        pkg[key] = updateField
      }
    })
  }

  resolve(filename){
    return path.resolve(this.generator.context, filename)
  }

  postProcessFiles (cb) {
    this.generator.postProcessFilesCbs.push(cb)
  }

  hasPlugin (id) {
    return this.generator.hasPlugin(id)
  }

  /**
   * 函数功能： 负责在entry.js等文件中，注入import
   * @param filename
   * @param imports
   */
  injectImports(filename, imports){
    if(!this.generator.imports[filename]){
      this.generator.imports[filename] = new Set()
    }

      (Array.isArray(imports) ? imports: [imports]).forEach(item=>{
        this.generator.imports[filename].add(item)
      })
    }

  /**
   * 函数功能： 负责在entry.js中的new Vue()时，注入选项
   * @param filename
   * @param imports
   */
  injectRootOptions(filename, imports){
    if(!this.generator.rootOptions[filename]) {
      this.generator.rootOptions[filename] = new Set()
    }

    (Array.isArray(imports) ? imports: [imports]).forEach(item=>{
      this.generator.rootOptions[filename].add(item)
    })
  }


  /**
   * 添加新的configPools到this.generator.configPools内
   * @param key
   * @param configMapping
   */
  addConfigPool(key, configMapping) {
    if (!configMapping) return
    const hasReserved = Object.keys(this.generator.reservedConfigPools).includes(key)
    if (hasReserved) {
      console.warn(`'${key}'为省缺配置文件，不可增加`)
      return
    }

    this.generator.configPools[key] = new ConfigPool(configMapping)
  }


  /**
   * 函数目的：把options上的对象和render中第二个参数传入的对象挂载到一起
   * 示例：    测试代码中生成的data为： {options:{n:1},m:2}
   * @private
   */
  _resolveData(additionalData) {
    return Object.assign({
      options: this.options
    }, additionalData)
  }


  /**
   * 函数目的： 把middleware推入
   * @param middleware  为异步函数数组
   * @private
   */
  _injectFileMiddleware(middleware) {
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
function extractCallDir() {
  // extract api.render() callsite file location using error stack
  const obj = {}
  Error.captureStackTrace(obj)
  const callSite = obj.stack.split('\n')[3]
  const fileName = callSite.match(/\s\((.*):\d+:\d+\)$/)[1]
  return path.dirname(fileName)
}


/**
 * 函数目的：将filePath路径上的文件使用ejs解析器进行解析。
 * 功能： 支持多重引用渲染。
 * @param filePath
 * @param data
 * @returns String 返回被ejs解析后的字符串。
 */
function renderFile(filePath, data) {
  if (isBinary.sync(filePath)) {
    return fs.readFileSync(filePath)
  }
  const template = fs.readFileSync(filePath, 'utf-8')

  // 处理yaml-front-matter
  const yaml = require('yaml-front-matter')
  const parsed = yaml.loadFront(template)

  // yaml-front-matter 双横线以下的部分，包含在__content字段下
  const content = parsed.__content
  let finalTemplate = content.trim() + '\n'
  // yaml-front-matter 双横线中的extend字段，进行解析
  if (parsed.extend) {
    const baseDir = path.dirname(filePath)
    const extendPath = path.isAbsolute(parsed.extend) ?
      parsed.extend : path.resolve(baseDir, parsed.extend)
    finalTemplate = fs.readFileSync(extendPath, 'utf-8')
    if (parsed.replace) {
      if (Array.isArray(parsed.replace)) {
        // 把注释符中间的字符抽离出来
        const replaceMatch = content.match(/<%# REPLACE %>([^]*?)<%# END_REPLACE %>/g)
        if (replaceMatch) {
          // 把匹配到的字符串，替换成目标文档中字符串
          const replaces = replaceMatch.map(m => {
            return m.replace(/<%# REPLACE %>([^]*?)<%# END_REPLACE %>/g, '$1').trim()
          })
          parsed.replace.forEach((r, i) => {
            finalTemplate = finalTemplate.replace(r, replaces[i])
          })
        }
      } else {
        // 把匹配到的字符串，替换成目标文档中字符串
        finalTemplate = finalTemplate.replace(parsed.replace, content.trim())
      }
    }
  }

  return ejs.render(finalTemplate, data)
}
