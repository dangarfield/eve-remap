export const loadData = () => {
    const dataString = localStorage.getItem('eve-remap')
    if (dataString) {
        return JSON.parse(dataString)
    }
    return {}
}
export const saveData = (key, value) => {
    const existingData = loadData()
    const newData = { ...existingData, [key]: value }
    const newDataString = JSON.stringify(newData)
    localStorage.setItem('eve-remap', newDataString)
}
export const clearData = (key) => {
    const existingData = loadData()
    delete existingData[key]
    const newDataString = JSON.stringify(existingData)
    localStorage.setItem('eve-remap', newDataString)
}
// module.exports = {}