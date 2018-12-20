### vue-cli最简骨架

仅实现最简单的模板文件渲染功能。


```
npm i generator-simple -S
```


当`template`下存在main.js 和 index.vue，内容为
```
<div id="<%- id %>">
  {{ message }}
</div>
```


```
const app = new Vue({
  el: '#<%- id %>',
  data: {
    message: "<%= options.message %>"
  }
})
```

写一个generator.js
```
const Generator = require('generator-simple')
const path = require('path')

const contextPath = path.join(__dirname, 'target')
const templatePath = path.join(__dirname, 'template')
const generator = new Generator(contextPath, {
  plugins: [
    {
      id: 'example',
      apply: api => {
        api.render(templatePath)
      },
      options: {
        message: "hello world!"
      }
    }
  ]
})

generator.generate()
```


运行`node generate.js`将在target目录下自动导出index.vue和main.js
```
<div id="helloDemo">
  {{ message }}
</div>
```

```
const app = new Vue({
  el: '#helloDemo',
  data: {
    message: "hello world!"
  }
})
```