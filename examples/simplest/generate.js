const Generator = require('../../lib/Generator')
const path = require('path')

const contextPath = path.join(__dirname, 'target')
const templatePath = path.join(__dirname, 'template')
const generator = new Generator(contextPath, {
  plugins: [
    {
      id: 'example',
      apply: api => {
        api.render(templatePath,{id: 'helloDemo'})
      },
      options: {
        message: "hello world!"
      }
    }
  ]
})

generator.generate()
