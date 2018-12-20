const GeneratorAPI = require('./GeneratorAPI')
const writeFileTree = require('./utils/writeFileTree')
const ConfigPool = require('config-pool')
const { injectImports, injectRootOptions } = require('./utils/inject')


const defaultConfigPools = {
  babel: new ConfigPool({
    js: ['babel.config.js']
  }),
  postcss: new ConfigPool({
    js: ['.postcssrc.js'],
    json: ['.postcssrc.json', '.postcssrc'],
    yaml: ['.postcssrc.yaml', '.postcssrc.yml']
  }),
  eslintConfig: new ConfigPool({
    js: ['.eslintrc.js'],
    json: ['.eslintrc', '.eslintrc.json'],
    yaml: ['.eslintrc.yaml', '.eslintrc.yml']
  }),
  jest: new ConfigPool({
    js: ['jest.config.js']
  }),
  browserslist: new ConfigPool({
    lines: ['.browserslistrc']
  })
}

const reservedConfigPools = {
  vue: new ConfigPool({
    js: ['vue.config.js']
  })
}

module.exports = class Generator {
  constructor(context, {
    plugins = [],
    files = {},
    pkg = {}
  }) {
    this.context = context
    this.files = files
    this.plugins = plugins

    this.imports = {}
    this.rootOptions = {}

    this.originalPkg = pkg
    this.pkg = Object.assign({}, pkg)

    this.reservedConfigPools = reservedConfigPools
    this.defaultConfigPools = defaultConfigPools

    this.configPools = {}

    // ==============新增==========
    this.postProcessFilesCbs = []
    this.fileMiddlewares = []

    plugins.forEach(({ id, apply, options }) => {
      const api = new GeneratorAPI(id, this, options)
      apply(api, options)
    })
  }

  async generate({ extractConfigFiles = false, checkExisting = false } = {}) {

    // 在extractConfigFiles中统一处理
    this.extractConfigFiles(extractConfigFiles, checkExisting)

    await this.resolveFiles()


    // 添加在文件链上添加package.json，数据即是this.pkg
    this.files['package.json'] = JSON.stringify(this.pkg, null, 2)
    this.sortPkg()
    await writeFileTree(this.context, this.files)
  }

  extractConfigFiles(extractConfigFiles, checkExisting) {

    // 将默认的5种格式、必备的格式、以及api.addConfigPool()中输入的格式合为一体
    const configPools = Object.assign({},
      this.defaultConfigPools,
      this.configPools,
      this.reservedConfigPools
    )

    // 注意：一定要用键头函数，使this可以穿透进函数体内
    const extractConfigs = (key)=> {
      // 必须在初始化时的pkg中没有，而在现在的pkg中存在的。
      if (configPools[key] && this.pkg[key] && !this.originalPkg[key]) {

        const updateObj = this.pkg[key]
        const configPool = configPools[key]
        let res
        if (checkExisting) {
           res = configPool.transform(
            updateObj,
            this.context,
            this.files
          )
        }else{
          res = configPool.transform(
            updateObj,
            this.context)
        }
        const {content, filename} = res
        this.files[filename] = content

        delete this.pkg[key]
      }
    }

    if(extractConfigFiles){
      Object.keys(this.pkg).forEach(key=>{
        extractConfigs(key)
      })
    }else{
      extractConfigs('vue')
      extractConfigs('babel')
    }
  }


  async resolveFiles() {

    for (const middleware of this.fileMiddlewares) {
      await middleware(this.files, require('ejs').render)
    }

    // 支持windows系统的文档结构
    normalizeFilePaths(this.files)

    Object.keys(this.files).forEach(file=>{
      if(this.imports[file]){
        this.files[file] = injectImports(this.files[file], Array.from(this.imports[file]))
      }

      if(this.rootOptions[file]){
        this.files[file] = injectRootOptions(this.files[file], Array.from(this.rootOptions[file]))
      }
    })

    for (const postProcess of this.postProcessFilesCbs) {
      await postProcess(this.files)
    }

    function normalizeFilePaths (files) {
      const slash = require('slash')
      Object.keys(files).forEach(file => {
        const normalized = slash(file)
        if (file !== normalized) {
          files[normalized] = files[file]
          delete files[file]
        }
      })
      return files
    }

  }

  sortPkg() {
    this.pkg.dependencies = sortObject(this.pkg.dependencies)
    this.pkg.devDependencies = sortObject(this.pkg.devDependencies)
    this.pkg.scripts = sortObject(this.pkg.scripts, [
      'serve',
      'build',
      'test',
      'e2e',
      'lint',
      'deploy'
    ])
    this.pkg = sortObject(this.pkg, [
      'name',
      'version',
      'private',
      'scripts',
      'dependencies',
      'devDependencies',
      'vue',
      'babel',
      'eslintConfig',
      'prettier',
      'postcss',
      'browserslist',
      'jest'
    ])


    function sortObject(obj, keyOrder) {
      if (!obj) return
      const res = {}
      const keys = Object.keys(obj)
      const getOrder = key => {
        const i = keyOrder.indexOf(key)
        return i === -1 ? Infinity : i
      }
      if (keyOrder) {
        keys.sort((a, b) => {
          return getOrder(a) - getOrder(b)
        })
      } else {
        keys.sort()
      }
      keys.forEach(key => {
        res[key] = obj[key]
      })
      return res
    }
  }

  hasPlugin (_id) {
    if (_id === 'router') _id = 'vue-router'
    if (['vue-router', 'vuex'].includes(_id)) {
      const pkg = this.pkg
      return ((pkg.dependencies && pkg.dependencies[_id]) || (pkg.devDependencies && pkg.devDependencies[_id]))
    }
    return [
      ...this.plugins.map(p => p.id),
      ...Object.keys(this.pkg.devDependencies || {}),
      ...Object.keys(this.pkg.dependencies || {})
    ].some(id => require('@vue/cli-shared-utils').matchesPluginId(_id, id))
  }
}