import { Api } from 'eve-esi-swaggerts'
import { loadData } from './utils'
import { refreshToken } from './login-state'

const esi = new Api()

const formatTime = (totalMinutes, full) => {
  const minutesPerDay = 24 * 60
  const minutesPerHour = 60
  const days = Math.floor(totalMinutes / minutesPerDay)
  const remainingMinutes = totalMinutes % minutesPerDay
  const hours = Math.floor(remainingMinutes / minutesPerHour)
  const minutes = Math.ceil(remainingMinutes % minutesPerHour)

  if (full) return `${days}d ${hours}h ${minutes}m`
  if (days < 0 && hours < 0) return `${minutes}m`
  if (days < 0 && hours > 0) return `${hours}h ${minutes}m`
  if (days > 0 && minutes > 0) return `${days}d ${hours + 1}h`
  return `${days}d ${hours}h`
}

const calculateSPPerMinute = (primary, secondary) => {
  return primary + 0.5 * secondary
}

// const calculateTotalSPRequired = (multiplier, level) => {
//   return 250 * multiplier * Math.pow(32, level - 1)
// }

const calculateSkillTrainingTime = (skillFromQueue, skill, attributes) => {
  // console.log('calculateSkillTrainingTime', skillFromQueue, skill, attributes)
  const { primary, secondary } = skill
  // console.log('calculateSkillTrainingTime', primary, secondary)
  const spPerMinute = calculateSPPerMinute(attributes[primary].total, attributes[secondary].total)
  // console.log('spPerMinute', attributes[primary].total, attributes[secondary].total, spPerMinute)
  const timeRequiredInMinutes = skillFromQueue.requiredSP / spPerMinute
  return timeRequiredInMinutes
}
const attList = ['charisma', 'intelligence', 'memory', 'perception', 'willpower']
const implantAttributeMap = {
  175: 'charisma',
  176: 'intelligence',
  177: 'memory',
  178: 'perception',
  179: 'willpower'
}
const skillTypeAttributeMap = {
  164: 'charisma',
  165: 'intelligence',
  166: 'memory',
  167: 'perception',
  168: 'willpower'
}
const skillAttributes = {
  180: 'primary',
  181: 'secondary',
  275: 'multiplier'
}
const getExpirationWaitTimeStringFromHeader = (expireText) => {
  const s = new Date(expireText)
  const e = new Date()
  const timeInSeconds = (s - e) / 1000
  if (timeInSeconds < 60) {
    // Less than 1 minute, show seconds only
    return `${Math.floor(timeInSeconds)}s`
  } else {
    // More than 1 minute, show minutes and seconds
    const minutes = Math.floor(timeInSeconds / 60)
    const seconds = Math.floor(timeInSeconds % 60)
    return `${minutes}m ${seconds}s`
  }
}
export const getSkillsData = async () => {
  const data = loadData()
  // console.log('data', data)
  const characterId = data.token.payload.sub.replace('CHARACTER:EVE:', '')
  const character = {
    characterId,
    name: data.token.payload.name
  }

  try {
    const skills = (await esi.characters.getCharactersCharacterIdSkills(characterId, { token: data.token.access_token })).data
    // console.log('skills', skills)

    const skillQueueRes = await esi.characters.getCharactersCharacterIdSkillqueue(characterId, { token: data.token.access_token })
    const skillQueue = {
      skills: skillQueueRes.data,
      total: 0,
      totalString: 0,
      refreshTime: getExpirationWaitTimeStringFromHeader(skillQueueRes.headers.get('expires'))
    }
    // console.log('skillQueue', skillQueue)

    const implantModifiers = Object.fromEntries(attList.map(attribute => [attribute, 0]))

    const implants = await Promise.all((await esi.characters.getCharactersCharacterIdImplants(characterId, { token: data.token.access_token })).data.map(async typeId => {
      const type = (await esi.universe.getUniverseTypesTypeId(typeId, { token: data.token.access_token })).data
      // console.log('implant', type)
      if (type) {
        type.dogma_attributes.forEach((attribute) => {
          const key = implantAttributeMap[attribute.attribute_id]
          if (key) {
            implantModifiers[key] += attribute.value
          }
        })
      }
      return typeId
    })
    )
    // console.log('implantModifiers', implantModifiers)
    // console.log('implants', implants)

    const attributes = (await esi.characters.getCharactersCharacterIdAttributes(characterId, { token: data.token.access_token })).data
    for (const att of attList) {
      const base = 17
      const implants = implantModifiers[att]
      const remap = attributes[att] - 17 - implantModifiers[att]
      const total = base + implants + remap
      // TODO Boosters?!
      attributes[att] = { base, implants, remap, total }
    }

    // console.log('attributes', attributes)

    const categories = (await esi.universe.getUniverseCategoriesCategoryId(16, { token: data.token.access_token })).data

    categories.groups = await Promise.all(categories.groups.map(async groupId => {
      const group = (await esi.universe.getUniverseGroupsGroupId(groupId, { token: data.token.access_token })).data
      group.types = await Promise.all(group.types.map(async typeId => {
        const type = (await esi.universe.getUniverseTypesTypeId(typeId, { token: data.token.access_token })).data
        const trainedSkill = skills.skills.find(s => s.skill_id === type.type_id)
        if (trainedSkill) {
          type.trainedSkillLevel = trainedSkill.trained_skill_level
          type.skillpoints = trainedSkill.skillpoints_in_skill
        } else {
          type.trainedSkillLevel = 0
          type.skillpoints = 0
        }
        const queuedSkill = skillQueue.skills.find(s => s.skill_id === type.type_id)
        if (queuedSkill) {
          type.queuedSkillLevel = queuedSkill.finished_level
        } else {
          type.queuedSkillLevel = 0
        }

        type.dogma_attributes.forEach((attribute) => {
          const key = skillAttributes[attribute.attribute_id]
          if (key) {
            type[key] = key === 'multiplier' ? attribute.value : skillTypeAttributeMap[attribute.value]
          }
        })

        return type
      }))

      group.types = group.types.filter(g => g.published === true)
      group.types.sort((a, b) => a.name.localeCompare(b.name))
      return group
    }))
    categories.groups = categories.groups.filter(g => g.published === true)
    categories.groups.sort((a, b) => a.name.localeCompare(b.name))

    const flatCategories = categories.groups.flatMap(group => group.types)

    skillQueue.skills.forEach(s => {
      const skill = flatCategories.find(f => f.type_id === s.skill_id)
      if (skill) {
        s.name = skill.name
        s.requiredSP = s.level_end_sp - Math.max(s.training_start_sp, s.level_start_sp)
        s.trainedSkillLevel = skill.trainedSkillLevel
        s.trainingTime = calculateSkillTrainingTime(s, skill, attributes)
        s.trainingTimeString = formatTime(s.trainingTime)
        s.multiplier = skill.multiplier
        s.primary = skill.primary
        s.secondary = skill.secondary
        skillQueue.total += s.trainingTime
      }
    })
    skillQueue.totalString = formatTime(skillQueue.total, true)
    // console.log('categories', categories)
    // console.log('flatCategories', flatCategories)
    return { skills, skillQueue, attributes, implants, categories, flatCategories, character }
  } catch (error) {
    console.error('error', error.error)
    if (error && error.error && error.error.error && error.error.error === 'token is expired') {
      await refreshToken()
      // TODO - Relaunch this method
      // return getSkillsData()
    }
  }
}

const groupByPrimaryAndSecondary = (data, retainList) => {
  const groupedData = data.reduce((acc, obj) => {
    const key = obj.primary + '-' + obj.secondary
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(obj)
    return acc
  }, {})
  const resultArray = Object.entries(groupedData).map(([key, dataList]) => {
    const obj = {
      // key,
      primary: key.split('-')[0],
      secondary: key.split('-')[1],
      // dataList,
      requiredSP: dataList.map(d => d.requiredSP).reduce((a, v) => a + v, 0)
    }
    if (retainList) obj.dataList = dataList
    return obj
  })

  return resultArray
}

const getSortingOrders = (arr) => {
  const result = []

  function permute (arr, start = 0) {
    if (start === arr.length) {
      result.push(arr.slice())
      return
    }

    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i], arr[start]] // Swap elements
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i], arr[start]] // Backtrack (undo the swap)
    }
  }

  permute(arr)
  return [...new Set(result.map(JSON.stringify))].map(JSON.parse)
}

// const getAttributeCombinations = (targetSum, maxCount, attributes, currentIndex, currentSum, currentAttributes, result) => {
//   if (currentSum === targetSum) {
//     result.push(currentAttributes.reduce((acc, att) => {
//       acc[att] = (acc[att] || 0) + 1
//       return acc
//     }, {}))
//     return
//   }

//   if (currentSum > targetSum || currentIndex === attributes.length) {
//     return
//   }

//   for (let i = 0; i <= maxCount; i++) {
//     if (currentSum + i <= targetSum && currentAttributes.filter(att => att === attributes[currentIndex]).length + i <= maxCount) {
//       for (let j = 0; j < i; j++) {
//         currentAttributes.push(attributes[currentIndex])
//       }
//       getAttributeCombinations(targetSum, maxCount, attributes, currentIndex + 1, currentSum + i, currentAttributes, result)
//       for (let j = 0; j < i; j++) {
//         currentAttributes.pop()
//       }
//     }
//   }
// }

// const getAllCombinations = (targetSum, maxCount, attributes) => {
//   const result = []
//   getAttributeCombinations(targetSum, maxCount, attributes, 0, 0, [], result)
//   return result
// }
const getPopularCombinations = (targetSum, maxCount, attributes) => {
  return [
    { charisma: 10, intelligence: 4 },
    { charisma: 10, memory: 4 },
    { charisma: 10, perception: 4 },
    { charisma: 10, willpower: 4 },

    { intelligence: 10, charisma: 4 },
    { intelligence: 10, memory: 4 },
    { intelligence: 10, perception: 4 },
    { intelligence: 10, willpower: 4 },

    { memory: 10, charisma: 4 },
    { memory: 10, intelligence: 4 },
    { memory: 10, perception: 4 },
    { memory: 10, willpower: 4 },

    { perception: 10, charisma: 4 },
    { perception: 10, intelligence: 4 },
    { perception: 10, memory: 4 },
    { perception: 10, willpower: 4 },

    { willpower: 10, charisma: 4 },
    { willpower: 10, intelligence: 4 },
    { willpower: 10, memory: 4 },
    { willpower: 10, perception: 4 },

    { charisma: 2, intelligence: 4, memory: 4, perception: 2, willpower: 2 },
    { charisma: 2, intelligence: 2, memory: 2, perception: 4, willpower: 4 }

  ]
}
const explodeRemapsOnce = (a) => {
  const b = []
  for (const aa of a) {
    const remapIndexes = aa.map((v, i) => (v.remap && Array.isArray(v.remap) ? i : null)).filter(i => i !== null)
    // console.log('aa',aa, remapIndexes)
    if (remapIndexes.length > 0) {
      const r = remapIndexes[0]
      // console.log('r', r, aa[r].remap)
      for (const r2 of aa[r].remap) {
        const newItem = JSON.parse(JSON.stringify(aa))
        newItem[r].remap = r2
        // console.log('  r2', r2, newItem)
        b.push(newItem)
      }
    } else {
      b.push(aa)
    }
  }
  return b
}

const explodeRemaps = (data, remapCount) => {
  let result = explodeRemapsOnce(data)
  for (let r = 1; r < remapCount; r++) {
    // console.log('sssss r', r)
    result = explodeRemapsOnce(result)
  }
  return result
}

// const allRemapCombinations = getAllCombinations(14,10, attList)
const allRemapCombinations = getPopularCombinations(14, 10, attList)
const allRemapCombinationsIndexList = Array.from({ length: allRemapCombinations.length }, (_, i) => i)
// const allRemapCombinationsIndexList = Array.from({ length: 11 }, (_, i) => i)

const calculateIndividualTimesForFastestPermutation = (startingAttributes, onePerm) => {
  const attributes = JSON.parse(JSON.stringify(startingAttributes))
  let time = 0
  for (const group of onePerm) {
    // console.log('group', group)
    if (group.dataList) {
      for (const dataItem of group.dataList) {
        // console.log('dataItem', dataItem)
        const spPerMinute = calculateSPPerMinute(attributes[group.primary].total, attributes[group.secondary].total)
        const timeRequiredInMinutes = dataItem.requiredSP / spPerMinute
        time += timeRequiredInMinutes
        dataItem.trainingTimeOpt = timeRequiredInMinutes
        dataItem.trainingTimeOptString = formatTime(timeRequiredInMinutes)
      }
    } else if (group.remap) {
      const remapAttrs = group.remap
      // console.log('change remap', group.remap, remapAttrs)
      for (const att of attList) {
        const remapValue = remapAttrs[att] ? remapAttrs[att] : 0
        attributes[att].remap = remapValue
        attributes[att].total = attributes[att].base + attributes[att].implants + remapValue
      }
    }
  }
  return time
}
const calculateTimeForOnePermutation = (startingAttributes, onePerm) => {
  // console.log('calculateTimeForOnePermutation', onePerm)

  const attributes = JSON.parse(JSON.stringify(startingAttributes))

  let time = 0
  for (const group of onePerm) {
    if (group.primary) {
      const spPerMinute = calculateSPPerMinute(attributes[group.primary].total, attributes[group.secondary].total)
      // // console.log('spPerMinute', attributes[primary].total, attributes[secondary].total, spPerMinute)
      const timeRequiredInMinutes = group.requiredSP / spPerMinute
      time += timeRequiredInMinutes
    } else if (group.remap) {
      const remapAttrs = allRemapCombinations[group.remap]
      // console.log('change remap', group.remap, remapAttrs)
      for (const att of attList) {
        const remapValue = remapAttrs[att] ? remapAttrs[att] : 0
        attributes[att].remap = remapValue
        attributes[att].total = attributes[att].base + attributes[att].implants + remapValue
      }
    }

    // console.log('group', group, attributes, time)
  }

  return time
}
export const optimiseSkillQueue = (skillsData, remapCount) => {
  // console.log('optimiseSkillQueue', skillsData, allRemapCombinations)

  const groupedSkillQueue = groupByPrimaryAndSecondary(skillsData.skillQueue.skills)
  for (let r = 0; r < remapCount; r++) {
    groupedSkillQueue.push({ remap: allRemapCombinationsIndexList })
  }

  // console.log('groupedSkillQueue', groupedSkillQueue)

  const allPermutations = getSortingOrders(groupedSkillQueue)
  // console.log('allPermutations', allPermutations)
  // console.log('allRemapCombinations', allRemapCombinations)

  const exploded = explodeRemaps(allPermutations, remapCount)
  // console.log('exploded', exploded)

  let fastestTime = 999999999999999
  let fastestPermutation
  for (let i = 0; i < exploded.length; i++) {
    // for (let i = 12000; i < 12010; i++) {
    const onePermutation = exploded[i]
    const time = calculateTimeForOnePermutation(skillsData.attributes, onePermutation)
    if (time < fastestTime) {
      fastestTime = time
      fastestPermutation = onePermutation
    }
    // console.log('onePermutation', i, time)
  }
  const groupedSkillQueueWithDataList = groupByPrimaryAndSecondary(skillsData.skillQueue.skills, true)
  // console.log('groupedSkillQueueWithDataList', groupedSkillQueueWithDataList)

  fastestPermutation = fastestPermutation.map(f => {
    // console.log('f', f)
    if (f.remap !== undefined) {
      // console.log('remap')
      f.remap = allRemapCombinations[f.remap]
    } else {
      f.dataList = groupedSkillQueueWithDataList.find(g => g.primary === f.primary && g.secondary === f.secondary).dataList

      // TODO - Need to correct the training time value for each dataList entry
      // f.dataList.forEach(d => {
      //     d.trainingTime
      // })
    }
    return f
  })
  const fastestTimeCheck = calculateIndividualTimesForFastestPermutation(skillsData.attributes, fastestPermutation)

  const fastestTimeString = formatTime(fastestTime, true)
  // TODO - Diff saving on fastest time
  console.log('fastest permutation', fastestTime, fastestTimeCheck, formatTime(fastestTime, true), fastestPermutation)
  return { fastestPermutation, fastestTime, fastestTimeString, remapCount }
}
