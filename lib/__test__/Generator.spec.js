jest.mock('fs')
const fs = require('fs-extra')
const path = require('path')
const Generator = require('../Generator')

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

  it('api: 引用渲染', async () => {
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