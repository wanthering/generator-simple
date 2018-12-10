const fs = require('fs-extra')
const path = require('path')


module.exports = async function writeFileTree(dir, files){
  return Promise.all(Object.keys(files).map(async name=>{
    const filePath = path.join(dir, name)
    await fs.ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, files[name])
  }))
}