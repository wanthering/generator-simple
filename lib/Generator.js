const GeneratorAPI = require('./GeneratorAPI')
const writeFileTree = require('./utils/writeFileTree')

module.exports = class Generator{

  constructor(context,{
    plugins = [],
    files = {}
  }){
    this.context = context
    this.files = files
    this.plugins = plugins

    this.fileMiddlewares = []

    plugins.forEach(({id, apply, options})=>{
      const api = new GeneratorAPI(id, this, options)
      apply(api,options)
    })
  }

  async generate(){
    await this.resolveFiles()
    // 通过中间件处理后，files显示为    { 'foo.js': 'foo(1)', 'bar/bar.js': 'bar(2)' }
    await writeFileTree(this.context, this.files)
  }

  async resolveFiles(){
    for(const middleware of this.fileMiddlewares){
      await middleware(this.files, require('ejs').render)
    }
  }
}