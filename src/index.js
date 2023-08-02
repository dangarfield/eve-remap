import { initLoginState } from './login-state'
import { getSkillsData, optimiseSkillQueue } from './skills-data'

const generateSkillLevels = (queuedLevel = 0, trainedLevel = 0, useBlank) => {
  const maxLevel = 5
  let initialChar = 'e'
  if ((queuedLevel > 0 && trainedLevel > 0)) initialChar = 'u'
  if (useBlank) initialChar = 'b'
  let result = initialChar.repeat(maxLevel)
  const q = 'q'.repeat(Math.min(maxLevel, queuedLevel))
  const t = 't'.repeat(Math.min(maxLevel, trainedLevel))
  for (const over of [q, t]) {
    for (let i = 0; i < over.length; i++) {
      result = result.slice(0, i) + over[i] + result.slice(i + 1)
    }
  }
  return result
}

const toRomanNumeral = (num) => {
  const romanNumerals = [
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
  ]
  let result = ''
  for (const { value, numeral } of romanNumerals) {
    while (num >= value) {
      result += numeral
      num -= value
    }
  }
  return result
}

const renderSkillImage = (queuedSkillLevel, trainedSkillLevel, useBlank) => {
  const template = generateSkillLevels(queuedSkillLevel, trainedSkillLevel, useBlank)
  return template.split('').map(v => `<span class="level-box ${v}"></span>`).join('')
}
const renderSkills = (datas) => {
  let html = ''
  // console.log('renderSkills', datas)
  html += `<h3>Skills <span class="text-secondary heading-small ps-3">${datas.skills.total_sp.toLocaleString()} SP Total</span></h3>`

  html += `<div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" role="switch" id="show-untrained-skills">
        <label class="form-check-label" for="show-untrained-skills">Show untrained skills</label>
    </div>`

  for (const group of datas.categories.groups) {
    const groupSP = group.types.reduce((total, obj) => total + obj.skillpoints, 0)

    html += `<h5 class="mt-4">${group.name} <span class="text-secondary heading-xs ps-3">${groupSP.toLocaleString()} SP</span></h5>`
    for (const type of group.types) {
      html += `<span class="level-container d-flex align-items-center${type.trainedSkillLevel > 0 ? '' : ' untrained'}"${type.trainedSkillLevel > 0 ? '' : ' style="display:none !important;"'}">`
      // html += `${renderSkillImage(type)} <span class="text">${type.name} - ${type.trainedSkillLevel} - ${type.queuedSkillLevel} - ${type.skillpoints}</span>`
      html += `${renderSkillImage(type.queuedSkillLevel, type.trainedSkillLevel)} <span class="text ps-2 align-top">${type.name}</span>`
      html += '</span>'
    }
  }
  document.querySelector('.skills').innerHTML = html
  document.querySelector('#show-untrained-skills').addEventListener('change', function () {
    document.querySelectorAll('.untrained').forEach((element) => {
      if (this.checked) {
        element.style.removeProperty('display')
      } else {
        element.style.setProperty('display', 'none', 'important')
      }
    })
  })
}
const renderQueue = (datas) => {
  let html = ''
  html += `<h3 class="m-0">Skill Queue <span class="text-secondary heading-small ps-3">${datas.skillQueue.skills.length} skills - ${datas.skillQueue.totalString}</span></h3>`
  html += `<p class="text-secondary mb-3">Can refresh in <span class="text-highlight">${datas.skillQueue.refreshTime}</span></p>`
  for (const skill of datas.skillQueue.skills) {
    html += '<span class="level-container d-flex align-items-center">'
    html += `${renderSkillImage(skill.finished_level, skill.trainedSkillLevel, true)}`
    html += `<span class="text ps-2 align-top">${skill.name} ${toRomanNumeral(skill.finished_level)}</span>`
    html += `<span class="text ps-2 align-top text-highlight">${skill.primary.slice(0, 1)} ${skill.secondary.slice(0, 1)}</span>`
    html += `<span class="text ps-2 align-top flex-fill"><span class="float-end">${skill.trainingTimeString}</span></span>`
    html += '</span>'
  }
  document.querySelector('.skills-queue').innerHTML = html
}
const renderOptimisedQueueLoading = () => {
  document.querySelector('.skills-queue-optimised').innerHTML = 'Calculating optimised queue order and remappings ...'
}
const renderOptimisedQueue = (datas, optimised) => {
  // console.log('renderOptimisedQueue', datas, optimised)
  const attList = ['charisma', 'intelligence', 'memory', 'perception', 'willpower']
  let html = ''
  html += ` <h3>Optimised Skill Queue <span class="text-secondary heading-small ps-3">${optimised.fastestTimeString}</span></h3>`

  for (let i = 1; i <= 2; i++) { // TODO - Should probably take current time into account too
    html += `
            <div class="form-check form-check-inline mb-3">
            <input class="form-check-input" type="radio" name="remap-count" id="remap-count-${i}" value="${i}"${optimised.remapCount === i ? ' checked' : ''}>
            <label class="form-check-label" for="remap-count-${i}">${i} remap${i > 1 ? 's' : ''}</label>
            </div>`
  }

  for (const group of optimised.fastestPermutation) {
    if (group.remap) {
      // console.log('render remap', group)
      html += '<span class="level-container d-flex align-items-center justify-content-between border my-2">'
      html += '<span class="text ps-2 align-top">REMAP</span>'
      for (const att of attList) {
        const attValue = group.remap[att] ? group.remap[att] : 0
        const nameShort = att.charAt(0).toUpperCase() + att.slice(1, 3)

        html += `<span class="text ps-2 align-top pe-2${attValue > 0 ? '' : ' text-light-emphasis'}">${nameShort}: ${attValue}</span>`
      }
      html += '</span>'
    }
    if (group.dataList) {
      // console.log('render dataList', group)
      for (const skill of group.dataList) {
        html += '<span class="level-container d-flex align-items-center">'
        html += `${renderSkillImage(skill.finished_level, skill.trainedSkillLevel, true)}`
        html += `<span class="text ps-2 align-top">${skill.name} ${toRomanNumeral(skill.finished_level)}</span>`
        html += `<span class="text ps-2 align-top text-highlight">${skill.primary.slice(0, 1)} ${skill.secondary.slice(0, 1)}</span>`
        html += `<span class="text ps-2 align-top flex-fill"><span class="float-end">${skill.trainingTimeOptString}</span></span>`
        html += '</span>'
      }
    }
  }
  document.querySelector('.skills-queue-optimised').innerHTML = html

  document.querySelectorAll('input[type="radio"][name="remap-count"]').forEach(btn => {
    btn.addEventListener('change', function (event) {
      const remapCount = parseInt(event.target.value)
      // console.log('remapCount', remapCount)
      renderOptimisedQueueLoading()
      setTimeout(() => {
        const optimised = optimiseSkillQueue(datas, remapCount)
        renderOptimisedQueue(datas, optimised)
      }, 100)
    })
  })
}
const renderCharacterPlaceholder = () => {
  let html = ''
  html += `
            <div class="col character">
            <div class="d-flex flex-nowrap">
                <div class="flex-grow-1 ps-2">
                    Loading...
                </div>
            </div>
            </div>`
  document.querySelector('.info').insertAdjacentHTML('afterend', html)
}
const renderCharacter = (datas) => {
  let html = ''
  html += `
            <div class="d-flex flex-nowrap">
                <div class="flex-shrink-0">
                    <img src="https://images.evetech.net/characters/${datas.character.characterId}/portrait?size=256">
                </div>
                <div class="flex-grow-1 ps-2">
                    <h3>${datas.character.name}</h3>
                    <div class="attributes">
                </div>
            </div>`
  document.querySelector('.character').innerHTML = html
}
const renderAttributes = (datas) => {
  let html = ''
  html += `<table class="table table-borderless attributes-table">
        <thead>
        <tr>
            <th scope="col"></th>
            <th scope="col">Base</th>
            <th scope="col">Implant</th>
            <th scope="col">Remap</th>
            <th scope="col">Total</th>
        </tr>
        </thead>
        <tbody>
            ${['charisma', 'intelligence', 'memory', 'perception', 'willpower'].map(a => {
                return `<tr>
                    <th scope="row">${a.charAt(0).toUpperCase()}${a.slice(1)}</th>
                    <td>${datas.attributes[a].base}</td>
                    <td>+${datas.attributes[a].implants}</td>
                    <td>${datas.attributes[a].remap === 0 ? '' : datas.attributes[a].remap}</td>
                    <td>${datas.attributes[a].total}</td>
                </tr>`
            }).join('')}
        </tbody>
    </table>
    `
  document.querySelector('.attributes').innerHTML = html
}
const init = async () => {
  const isLoggedIn = await initLoginState()
  // console.log('isLoggedIn', isLoggedIn)
  if (isLoggedIn) {
    renderCharacterPlaceholder()
    const skillsData = await getSkillsData()
    renderCharacter(skillsData)
    renderAttributes(skillsData)
    renderSkills(skillsData)
    renderQueue(skillsData)

    renderOptimisedQueueLoading()
    setTimeout(() => {
      const remapCount = 1
      const optimised = optimiseSkillQueue(skillsData, remapCount)
      renderOptimisedQueue(skillsData, optimised)
    }, 100)
  }
}

init()
