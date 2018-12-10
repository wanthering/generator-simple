jest.mock('fs')
const fs = require('fs-extra')
const path = require('path')
const Generator = require('../Generator')

const templateDir = path.resolve(__dirname, 'template')

fs.ensureDirSync(templateDir)
fs.writeFileSync(path.resolve(templateDir, 'foo.js'), 'foo(<%- options.n %>)')
fs.ensureDirSync(path.resolve(templateDir, 'bar'))
fs.writeFileSync(path.resolve(templateDir, 'bar/bar.js'), 'bar(<%- m %>)')

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

    expect(fs.readFileSync('/foo.js', 'utf-8')).toEqual('foo(1)')
    expect(fs.readFileSync('/bar/bar.js', 'utf-8')).toEqual('bar(2)')
  })
})