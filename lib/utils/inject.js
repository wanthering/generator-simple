const j = require('jscodeshift')

const injectImports = function (source, importList) {

  const root = j(source)

  const body = root.get().value.program.body

  let lastImportIndex = -1
  const importDeclarations = []

  root.find(j.ImportDeclaration).forEach(path=>{
    importDeclarations.push(path.value)
    lastImportIndex = body.findIndex(n => n === path.value)
  })

  delete body[lastImportIndex].loc

  const importASTList = importList.map(s=>j(s.trim()+'\n').find(j.ImportDeclaration).get().value)
    .filter(i=>{
      return !importDeclarations.some(node => {
        const result = node.source.raw === i.source.raw && node.specifiers.length === i.specifiers.length
        return result && node.specifiers.every((item, index) => {
          return i.specifiers[index].local.name === item.local.name
        })
      })
    })

  body.splice(lastImportIndex+1,0,...importASTList)

  return root.toSource()
}


const injectRootOptions = function (source, rootOptions) {
  const root = j(source)

  const toProperty = j(`({${rootOptions.join(',')}})`).find(j.ObjectExpression).get().value.properties

  const vueNode = root.find(j.NewExpression,node=>{
    return node.callee.name==='Vue'&&node.arguments[0].type === 'ObjectExpression'
  }).get().value


  const vueProperties = vueNode.arguments[0].properties

  const filteredProperties = toProperty.filter(i=>{
    return !vueProperties.slice(0,-1).some(p=>{
      return p.key.name === i.key.name && j(p).toSource() === j(i).toSource()
    })
  })

  vueNode.arguments[0].properties = [...vueProperties.slice(0, -1), ...filteredProperties, ...vueProperties.slice(-1)]

  return root.toSource()
}


module.exports = {injectImports, injectRootOptions}