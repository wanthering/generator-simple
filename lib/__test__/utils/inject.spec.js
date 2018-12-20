const source = `
import foo from 'foo'
import baz from 'baz'

new Vue({
  p: p(),
  foo,
  baz,
  render: h => h(App)
}).$mount('#app')`.trim()

const { injectImports, injectRootOptions } = require('../inject')

describe('entry.js的注入', () => {
  it('注入单个import', () => {

    expect(injectImports(source, [`import bar from 'bar'`,
      `import qux from 'qux'`,
      `import baz from 'baz'`]
    )).toEqual(
`import foo from 'foo'
import baz from 'baz'
import bar from 'bar'
import qux from 'qux'

new Vue({
  p: p(),
  foo,
  baz,
  render: h => h(App)
}).$mount('#app')`
    )
  })
})