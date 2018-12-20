jest.mock('fs')
const fs = require('fs-extra')
const path = require('path')
const Generator = require('../Generator')

const stringifyJS = require('javascript-stringify')
const js = v => `module.exports = ${stringifyJS(v, null, 2)}`
const json = v => JSON.stringify(v, null, 2)

const templateDir = path.resolve(__dirname, 'template')

fs.ensureDirSync(templateDir)
fs.writeFileSync(path.resolve(templateDir, 'foo.js'), 'foo(<%- options.n %>)')
fs.ensureDirSync(path.resolve(templateDir, 'bar'))
fs.writeFileSync(path.resolve(templateDir, 'bar/bar.js'), 'bar(<%- m %>)')

fs.writeFileSync(path.resolve(templateDir, 'multi-replace-source.js'), `
foo(1)
bar(2)`)

fs.writeFileSync(path.resolve(templateDir, 'multi-replace.js'), `
---
extend: '${path.resolve(templateDir, 'multi-replace-source.js')}'
replace:
  - !!js/regexp /foo\\((.*)\\)/
  - !!js/regexp /bar\\((.*)\\)/
---
<%# REPLACE %>
baz($1)
<%# END_REPLACE %>

<%# REPLACE %>
qux($1)
<%# END_REPLACE %>
`.trim())

fs.writeFileSync(path.resolve(templateDir, 'entry.js'), `
import foo from 'foo'
import baz from 'baz'

new Vue({
  p: p(),
  foo,
  baz,
  render: h => h(App)
}).$mount('#app')
`.trim())


describe('文件的渲染输出', () => {
  it('api: 渲染template目录', async () => {
    const generator = new Generator('/', {
      plugins: [
        {
          id: 'test',
          apply: api => {
            api.render('./template', { m: 2 })
          },
          options: {
            n: 1
          }
        }
      ]
    })

    await generator.generate()

    expect(fs.readFileSync('/foo.js', 'utf-8')).toMatch('foo(1)')
    expect(fs.readFileSync('/bar/bar.js', 'utf-8')).toMatch('bar(2)')
  })

  it('api: 使用对象进行渲染', async () => {
    const generator = new Generator('/', {
      plugins: [
        {
          id: 'test',
          apply: api => {
            api.render({
              'foo1.js': path.join(templateDir, 'foo.js'),
              'bar/bar1.js': path.join(templateDir, 'bar/bar.js')
            }, { m: 3 })
          },
          options: {
            n: 2
          }
        }
      ]
    })

    await generator.generate()

    expect(fs.readFileSync('/foo1.js', 'utf-8')).toMatch('foo(2)')
    expect(fs.readFileSync('/bar/bar1.js', 'utf-8')).toMatch('bar(3)')
  })

  it('api: 使用函数进行渲染', async () => {
    const generator = new Generator('/', {
      plugins: [
        {
          id: 'test',
          apply: (api, options) => {
            api.render((files, render) => {
              files['foo2.js'] = render('foo(<%- n %>)', options)
              files['bar/bar2.js'] = render('bar(<%- n %>)', options)
            })
          },
          options: {
            n: 3
          }
        }
      ]
    })

    await generator.generate()

    expect(fs.readFileSync('/foo2.js', 'utf-8')).toMatch('foo(3)')
    expect(fs.readFileSync('/bar/bar2.js', 'utf-8')).toMatch('bar(3)')
  })

  it('api: 多重引用渲染', async () => {
    const generator = new Generator('/', {
      plugins: [
        {
          id: 'test1',
          apply: api => {
            api.render('./template', { m: 2 })
          },
          options: {
            n: 1
          }
        }
      ]
    })

    await generator.generate()

    expect(fs.readFileSync('/multi-replace.js', 'utf-8')).toMatch('baz(1)\nqux(2)')
  })
})

describe('package.json文件生成', () => {
  it('使用进行修改', async () => {
    const generator = new Generator('/', {
      pkg: {
        name: 'hello',
        list: [1],
        vue: {
          foo: 1,
          bar: 2
        }
      },
      plugins: [{
        id: 'test',
        apply: api => {
          api.extendPackage({
            name: 'hello2',
            list: [2],
            vue: {
              foo: 2,
              baz: 3
            }
          })
        }
      }]
    })

    await generator.generate()

    const pkg = JSON.parse(fs.readFileSync('/package.json', 'utf-8'))
    expect(pkg).toEqual({
      list: [1, 2],
      vue: {
        foo: 2,
        bar: 2,
        baz: 3
      },
      name: 'hello2'
    })
  })

  it('使用函数进行修改', async () => {
    const generator = new Generator('/', {
      pkg: {
        name: 'hello',
        list: [1],
        vue: {
          foo: 1,
          bar: 2
        }
      },
      plugins: [{
        id: 'test',
        apply: api => {
          api.extendPackage(pkg => ({
            vue: {
              foo: pkg.vue.foo + 1
            }
          }))
        }
      }]
    })

    await generator.generate()

    const pkg = JSON.parse(fs.readFileSync('/package.json', 'utf-8'))
    expect(pkg).toEqual({
      name: 'hello',
      list: [1],
      vue: {
        foo: 2,
        bar: 2
      }
    })
  })
})


describe('处理配置文件', () => {
  it("新增ConfigPool", async () => {
    const configs = {
      fooConfig: {
        bar: 42
      }
    }

    const generator = new Generator('/', {
      plugins: [{
        id: 'test',
        apply: api => {
          api.addConfigPool('fooConfig', {
            json: ['foo.config.json']
          })
          api.extendPackage(configs)
        }
      }]
    })

    await generator.generate({
      extractConfigFiles: true
    })

    expect(fs.readFileSync('/foo.config.json', 'utf-8')).toMatch(json(configs.fooConfig))
    expect(generator.pkg).not.toHaveProperty('fooConfig')
  })

  it('批量写入配置文件', async () => {
    const configs = {
      vue: {
        lintOnSave: false
      },
      babel: {
        presets: ['@vue/app']
      },
      postcss: {
        autoprefixer: {}
      },
      eslintConfig: {
        extends: ['plugin:vue/essential']
      },
      jest: {
        foo: 'bar'
      },
      browserslist: [
        '> 1%',
        'not <= IE8'
      ]
    }

    const generator = new Generator('/', { plugins: [
        {
          id: 'test',
          apply: api => {
            api.extendPackage(configs)
          }
        }
      ] })

    await generator.generate({
      extractConfigFiles: true,
    })

    expect(fs.readFileSync('/vue.config.js', 'utf-8')).toMatch(js(configs.vue))
    expect(fs.readFileSync('/babel.config.js', 'utf-8')).toMatch(js(configs.babel))
    expect(fs.readFileSync('/.postcssrc.js', 'utf-8')).toMatch(js(configs.postcss))
    expect(fs.readFileSync('/.eslintrc.js', 'utf-8')).toMatch(js(configs.eslintConfig))
    expect(fs.readFileSync('/jest.config.js', 'utf-8')).toMatch(js(configs.jest))
    expect(fs.readFileSync('/.browserslistrc', 'utf-8')).toMatch('> 1%\nnot <= IE8')
  })

  it('打开checkExisting，更新已在存的配置文件', async () => {
    const configs = {
      vue: {
        lintOnSave: false
      },
      babel: {
        presets: ['@vue/app']
      },
      eslintConfig: {
        env: {
          node: false
        },
        plugins: ['bar']
      }
    }

    fs.writeFileSync('/.eslintrc',
`{
"env": {
    "browser": true,
    "node": true
  },
  "plugins": ["foo"]
}`
    )
    const mockFiles = {'.eslintrc':fs.readFileSync('/.eslintrc','utf-8')}



    const generator = new Generator('/', {
      files: mockFiles,
      plugins: [
        {
          id: 'test',
          apply: api => {
            api.extendPackage(configs)
          },
        }
      ] })

    await generator.generate({
      extractConfigFiles: true,
      checkExisting: true
    })

    expect(fs.readFileSync('/vue.config.js', 'utf-8')).toEqual(js(configs.vue))
    expect(fs.readFileSync('/babel.config.js', 'utf-8')).toEqual(js(configs.babel))

    const eslintExpectObject = {
      env: {
        browser: true,
        node: false
      },
      plugins: ['foo', 'bar']
    }
    expect(fs.readFileSync('/.eslintrc', 'utf-8')).toEqual(json(eslintExpectObject))
  })
})

describe('entry.js文件的注入',()=>{
  it('插入Import和rootOption', async ()=>{
    const generator = new Generator('/', { plugins: [
        {
          id: 'test',
          apply: api => {
            api.injectImports('main.js', `import bar from 'bar'`)
            api.injectRootOptions('main.js', ['foo', 'bar'])
            api.render({
              'main.js': path.join(templateDir, 'entry.js')
            })
          }
        }
      ] })

    await generator.generate()

    expect(fs.readFileSync('/main.js', 'utf-8')).toEqual(
`import foo from 'foo'
import baz from 'baz'
import bar from 'bar'

new Vue({
  p: p(),
  foo,
  baz,
  bar,
  render: h => h(App)
}).$mount('#app')
`
    )})
})

test('api: hasPlugin', () => {
  new Generator('/', { plugins: [
      {
        id: 'foo',
        apply: api => {
          expect(api.hasPlugin('foo')).toBe(true)
          expect(api.hasPlugin('bar')).toBe(true)
          expect(api.hasPlugin('baz')).toBe(true)
          expect(api.hasPlugin('vue-cli-plugin-bar')).toBe(true)
          expect(api.hasPlugin('@vue/cli-plugin-baz')).toBe(true)
        }
      },
      {
        id: 'vue-cli-plugin-bar',
        apply: () => {}
      },
      {
        id: '@vue/cli-plugin-baz',
        apply: () => {}
      }
    ] })
})
