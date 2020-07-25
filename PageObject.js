const { assert, expect } = require('chai')
const { until } = require('selenium-webdriver')
const jsonfile = require('jsonfile')
const { log } = require('@nodebug/logger')
const config = require('@nodebug/config')('selenium')
const WebElement = require('./app/WebElement')
const {
  getDriver,
  activateTab,
  closeTabAndSwitch,
  getURL,
  getTitle,
} = require('./driver')
const {
  populateInput,
  populateClick,
  populateSelect,
  populateRichTextField,
} = require('./populate')

function PageObject(pageNameInput, pageNameDirectoryInput) {
  const that = {}
  that.pageName = pageNameInput
  that.pageDefinitionFileName = pageNameDirectoryInput + pageNameInput
  that.pageElements = new Map() // a hash of all of the web elements for this page.
  that.driver = getDriver()

  const addElement = (elementName, elements) =>
    that.pageElements.set(elementName, elements)

  const getElement = async (elementName) => that.pageElements.get(elementName)

  const hasElement = async (elementName) => that.pageElements.has(elementName)

  const loadPageDefinitionFile = (fullFileName) => {
    const elements = jsonfile.readFileSync(fullFileName)
    Object.values(elements.webElements).forEach((element) =>
      addElement(element.name, element),
    )
  }

  const addDynamicElement = async (elementName, additionalDescription) => {
    if (await hasElement(elementName)) {
      if (typeof additionalDescription !== 'undefined') {
        const newElementName = `${elementName} ${additionalDescription}`
        if (!(await hasElement(newElementName))) {
          const dynamicElement = { ...(await getElement(elementName)) }
          dynamicElement.name = newElementName
          dynamicElement.definition = dynamicElement.definition.replace(
            '<ReplaceText>',
            additionalDescription,
          )
          addElement(newElementName, dynamicElement)
        }
        return newElementName
      }
      return elementName
    }
    assert.fail(
      `ERROR: WebElement ${elementName} not found in PageElements for adding dynamic element.`,
    )
    return elementName
  }

  const genericAssertElement = async (payload) => {
    const timeout = (payload.timeout || config.timeout) * 1000
    const { implicit } = await that.driver.manage().getTimeouts()
    await that.driver.manage().setTimeouts({ implicit: 1000 })

    let WebElementObject = ''
    let WebElementData = {}
    let status
    const element = await addDynamicElement(
      payload.elementName,
      payload.replaceText,
    )
    log.info(`Waiting for ${element} to be ${payload.condition}`)
    if (await hasElement(element)) {
      WebElementData = await getElement(element)
      // await switchFrame(WebElementData.frame)
      WebElementObject = new WebElement(that.driver, WebElementData)
      switch (payload.condition.toLowerCase()) {
        case 'disabled':
          await that.driver.manage().setTimeouts({ implicit })
          status = !(await WebElementObject.isEnabled())
          log.debug(`WebElement ${element} is disabled on page. PASS`)
          break
        case 'present':
          status = await WebElementObject.isPresent(timeout)
          log.debug(`WebElement ${element} is present on page. PASS`)
          break
        case 'not present':
          status = await WebElementObject.isNotPresent(timeout)
          log.debug(`WebElement ${element} is not present on page. PASS`)
          break
        default:
          assert.fail(`Only visibility and invisibility suppoorted.
          ${payload.condition} kind of wait is not defined.`)
      }
    } else {
      assert.fail(
        `ERROR: WebElement ${element} not found in PageElements during AssertElement attempt.`,
      )
    }
    that.driver.manage().setTimeouts({ implicit })
    return status
  }

  const waitForElementVisibility = async (
    elementName,
    replaceText,
    timeout,
  ) => {
    try {
      await genericAssertElement({
        condition: 'present',
        elementName,
        replaceText,
        timeout,
      })
    } catch (err) {
      log.info(
        `Element not present on page after ${
          timeout || config.timeout
        } second wait`,
      )
      throw err
    }
  }

  const waitForElementInvisibility = async (
    elementName,
    replaceText,
    timeout,
  ) => {
    try {
      await genericAssertElement({
        condition: 'not present',
        elementName,
        replaceText,
        timeout,
      })
    } catch (err) {
      log.info(
        `Element present on page after ${
          timeout || config.timeout
        } second wait`,
      )
      throw err
    }
  }

  const assertElementExists = async (elementName, replaceText) =>
    waitForElementVisibility(elementName, replaceText)

  const assertElementDoesNotExist = async (elementName, replaceText) =>
    waitForElementInvisibility(elementName, replaceText)

  const checkElementExists = async (elementName, replaceText) => {
    try {
      await waitForElementVisibility(elementName, replaceText, 5)
      return true
    } catch (err) {
      return false
    }
  }

  const assertElementDisabled = async (elementName, replaceText) => {
    if (
      !(await genericAssertElement({
        condition: 'disabled',
        elementName,
        replaceText,
      }))
    ) {
      assert.fail(
        `Element is not disabled on page after ${config.timeout} second wait`,
      )
    }
  }

  const switchFrame = async (elementName) => {
    await that.driver.switchTo().defaultContent()
    if (elementName === 'default') {
      // if frame name is default then see above
    } else if (typeof elementName === 'number') {
      log.debug(`Switching to frame number ${elementName}`)
      await that.driver.wait(
        until.ableToSwitchToFrame(elementName, config.timeout * 1000),
      )
    } else {
      // add frame displayd condition
      //
      //
      //
      //
      log.debug(`Switching to frame ${elementName}`)
      const WebElementData = await getElement(elementName)
      const WebElementObject = new WebElement(that.driver, WebElementData)
      const webElement = await WebElementObject.getWebElement()
      await that.driver.wait(
        until.ableToSwitchToFrame(webElement, config.timeout * 1000),
      )
    }
  }

  const genericPopulateElement = async (payload) => {
    let WebElementObject = ''
    let WebElementData = {}

    try {
      const element = await addDynamicElement(
        payload.elementName,
        payload.replaceText,
      )
      if (payload.value.toLowerCase() !== 'click') {
        log.info(
          `Starting populate the WebElement: ${element} with value ${payload.value}`,
        )
      } else {
        log.info(`Starting click the WebElement: ${element}`)
      }

      if (await hasElement(element)) {
        WebElementData = await getElement(element)
        const actionElement = {}

        // Setup all underlying required objects to take action on for this action
        actionElement.element = WebElementData
        // if (WebElementData && WebElementData.waitForElementToBeInvisible) {
        //   if (await hasElement(WebElementData.waitForElementToBeInvisible)) {
        //     const elementToWaitToBeInvisible = await getElement(WebElementData.waitForElementToBeInvisible);
        //     actionElement.elementToWaitToBeInvisible = elementToWaitToBeInvisible;
        //   }
        // }
        // if (WebElementData && WebElementData.waitToBeVisible) {
        //   if (await hasElement(WebElementData.waitToBeVisible)) {
        //     const waitToBeVisible = await getElement(WebElementData.waitToBeVisible);
        //     actionElement.waitToBeVisible = waitToBeVisible;
        //   }
        // }

        // If need to hit a iframe, do it
        await switchFrame(WebElementData.frame)
        WebElementObject = new WebElement(that.driver, WebElementData)
        actionElement.webElement = WebElementObject

        const webElement = await WebElementObject.getWebElement()
        const tagName = await webElement.getTagName()
        if (payload.value === 'click') {
          await populateClick(webElement, payload.value, actionElement)
          return true
        }
        switch (tagName.toLowerCase()) {
          case 'input':
          case 'textarea':
            await populateInput(webElement, payload.value, actionElement)

            break
          case 'a':
          case 'button':
          case 'div':
          case 'span':
          case 'ul':
          case 'li':
          case 'th':
          case 'h2':
          case 'section':
            await populateRichTextField(
              webElement,
              payload.value,
              actionElement,
            )
            break
          case 'svg':
            await populateSelect(webElement, payload.value, actionElement)
            break
          case 'select':
          case 'p':
            await populateSelect(webElement, payload.value, actionElement)
            break
          case 'label':
          case 'option':
            await populateClick(webElement, payload.value, actionElement)
            break
          default:
            assert.fail(`ERROR: We tried to populate an unknown tag(${tagName}) of
          element(${element}) with data in populateGenericElement()\n\tWe failed.`)
        }
      } else {
        assert.fail(
          `ERROR: WebElement ${element} not found in PageElements during PopulateElement() attempt.`,
        )
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
    return true
  }

  const populateElement = async (elementName, replaceText, value) => {
    if (value === undefined && replaceText !== undefined) {
      /* eslint-disable no-param-reassign */
      value = replaceText
      replaceText = undefined
      /* eslint-enable no-param-reassign */
    }
    await genericPopulateElement({ elementName, replaceText, value })
  }

  const clickElement = async (elementName, replaceText) =>
    genericPopulateElement({ elementName, replaceText, value: 'click' })

  const genericPopulateDatable = async (table) => {
    log.debug('I populated table')

    const rows = table.raw()
    const numberOfColumns = rows[0].length
    const numberOfRows = rows.length - 1

    for (let rowIndex = 1; rowIndex < numberOfRows; rowIndex += 1) {
      for (
        let columnIndex = 0;
        columnIndex < numberOfColumns;
        columnIndex += 1
      ) {
        log.debug('TABLE: ', rows[0][columnIndex], rows[rowIndex][columnIndex])
        // eslint-disable-next-line no-await-in-loop
        await genericPopulateElement(
          rows[0][columnIndex],
          rows[rowIndex][columnIndex],
        )
      }
    }
  }

  const getWebElements = async (elementName, replaceText) => {
    let elementList
    const element = await addDynamicElement(elementName, replaceText)

    if (await hasElement(element)) {
      let WebElementData = {}
      WebElementData = await getElement(element)
      await switchFrame(WebElementData.frame)
      const WebElementObject = new WebElement(that.driver, WebElementData)
      elementList = await WebElementObject.getWebElements()
      return elementList
    }
    assert.fail(`Element ${element} not found.`)
    return elementList
  }

  // const generateDataTable = async (padLength) => {
  //   const localPadLength = padLength || 0;
  //   const _NA = '| NA'.padEnd(localPadLength + 1);
  //   console.log(`\nGenerating data table for ${that.pageName} \n`);
  //   try {
  //     // Return a | delimited list of the field names in the pageDefs file for this PageObject
  //     console.log(`|${that.pageElements.keyList('|', localPadLength)}`);

  //     // Generate a list of NA for the page object.
  //     let NAList = '';
  //     let i;
  //     const elementCount = that.pageElements.length;
  //     for (i = 0; i < elementCount; i++) {
  //       NAList += _NA;
  //     }
  //     console.log(`${NAList}|`);
  //   } catch (err) {
  //     log.error(err.stack);
  //     throw err;
  //   }
  // };

  // to be revisited
  const scrollElementIntoView = async (elementName, replaceText) => {
    let retval
    let WebElementObject = ''
    let WebElementData = {}
    const element = await addDynamicElement(elementName, replaceText)

    log.debug(`Scrolling element: ${element} into view.`)
    if (await hasElement(element)) {
      WebElementData = await getElement(element)
      const actionElement = {}
      await switchFrame(WebElementData.frame)
      WebElementObject = new WebElement(that.driver, WebElementData)
      actionElement.webElement = WebElementObject
      log.info(
        `Info: Page Element ${element} retrieved from Page Elements collection for exists check.`,
      )
      return WebElementObject.scrollIntoView()
    }
    assert.fail(
      `ERROR: WebElement ${element} not found in PageElements during scrollElementIntoView() attempt.`,
    )
    return retval
  }

  // to be revisited
  const genericGetAttribute = async (elementName, attributeName) => {
    let returnValue
    if (await hasElement(elementName)) {
      let WebElementData = {}
      WebElementData = await getElement(elementName)
      await switchFrame(WebElementData.frame)
      const WebElementObject = new WebElement(that.driver, WebElementData)
      const webElement = await WebElementObject.getWebElement()

      if (attributeName === undefined) {
        // eslint-disable-next-line no-param-reassign
        attributeName = 'textContent'
      }

      if (attributeName.toLowerCase() === 'text') {
        returnValue = await webElement.getText()
      } else if (attributeName === 'selected') {
        returnValue = await webElement.isSelected()
      } else {
        returnValue = await webElement.getAttribute(attributeName)
      }
      log.info(
        `Attribute "${attributeName}" value for element "${elementName}" is "${returnValue}".`,
      )
      return returnValue
    }
    assert.fail(
      `ERROR: WebElement ${elementName} not found in PageElements during GetAttributeValue() attempt.`,
    )
    return returnValue
  }

  const getAttributeValue = async (elementName, replaceText, attributeName) => {
    if (attributeName === undefined && replaceText !== undefined) {
      /* eslint-disable no-param-reassign */
      attributeName = replaceText
      replaceText = undefined
      /* eslint-enable no-param-reassign */
    }
    const element = await addDynamicElement(elementName, replaceText)

    try {
      return await genericGetAttribute(element, attributeName)
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const getText = async (elementName, replaceText) => {
    const element = await addDynamicElement(elementName, replaceText)

    try {
      return await genericGetAttribute(element)
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const assertText = async (elementName, replaceText, expectedValue) => {
    if (expectedValue === undefined && replaceText !== undefined) {
      /* eslint-disable no-param-reassign */
      expectedValue = replaceText
      replaceText = undefined
      /* eslint-enable no-param-reassign */
    }
    const element = await addDynamicElement(elementName, replaceText)

    try {
      const actualValue = await genericGetAttribute(element)
      log.info(`Asserting text for "${element}".`)
      if (await expect(actualValue).to.equal(expectedValue)) {
        log.info(
          `Actual value "${actualValue}" equals Expected value "${expectedValue}". PASS`,
        )
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const assertTextIncludes = async (
    elementName,
    replaceText,
    expectedValue,
  ) => {
    if (expectedValue === undefined && replaceText !== undefined) {
      /* eslint-disable no-param-reassign */
      expectedValue = replaceText
      replaceText = undefined
      /* eslint-enable no-param-reassign */
    }
    const element = await addDynamicElement(elementName, replaceText)

    try {
      const actualValue = await genericGetAttribute(element)
      log.info(`Asserting text for "${element}".`)
      if (await expect(actualValue).to.include(expectedValue)) {
        log.info(
          `Actual value "${actualValue}" includes Expected value "${expectedValue}". PASS`,
        )
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const assertTextDoesNotInclude = async (
    elementName,
    replaceText,
    expectedValue,
  ) => {
    if (expectedValue === undefined && replaceText !== undefined) {
      /* eslint-disable no-param-reassign */
      expectedValue = replaceText
      replaceText = undefined
      /* eslint-enable no-param-reassign */
    }
    const element = await addDynamicElement(elementName, replaceText)

    try {
      const actualValue = await genericGetAttribute(element)
      log.info(`Asserting text for "${element}" does not exist`)

      if (await expect(actualValue).to.not.include(expectedValue)) {
        log.info(
          `Actual value "${actualValue}" includes Expected value "${expectedValue}". PASS`,
        )
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const switchToTab = async (tabName) => {
    try {
      log.debug(`Switching to tab : ${tabName}`)
      if (!(await activateTab(tabName))) {
        assert.fail(`${tabName} tab was not found. FAIL`)
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const closeTab = async (tabName) => {
    try {
      log.debug(`Closing tab : ${tabName}`)
      await closeTabAndSwitch(tabName)
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const getCurrentURL = async () => {
    try {
      log.debug('Getting URL of the current tab.')
      return await getURL()
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const getPageTitle = async () => {
    try {
      log.debug('Getting the title of the current tab.')
      return await getTitle()
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const assertPageTitle = async (expectedValue) => {
    try {
      const actualValue = await getPageTitle()
      log.info('Asserting page title match for current tab.')
      if (await expect(actualValue).to.equal(expectedValue)) {
        log.info(
          `Actual value "${actualValue}" equals Expected value "${expectedValue}". PASS`,
        )
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const assertPageTitleIncludes = async (expectedValue) => {
    try {
      const actualValue = await getPageTitle()
      log.info('Asserting page title partial match for current tab.')
      if (await expect(actualValue).to.include(expectedValue)) {
        log.info(
          `Actual value "${actualValue}" includes Expected value "${expectedValue}". PASS`,
        )
      }
    } catch (err) {
      log.error(err.stack)
      throw err
    }
  }

  const genericAlertOperations = async (operation) => {
    let retval
    if (await that.driver.wait(until.alertIsPresent())) {
      const alert = that.driver.switchTo().alert()
      switch (operation.toLowerCase()) {
        case 'accept':
          retval = await alert.accept()
          break
        case 'dismiss':
          retval = await alert.dismiss()
          break
        case 'text':
          retval = alert.getText()
          break
        default:
          assert.fail(
            `ERROR: ${operation} is not implemented in genericAlertOperations().`,
          )
      }
    } else {
      assert.fail('ERROR: Assert pop up was not displayed.')
    }
    return retval
  }

  const acceptAlert = async () => {
    await genericAlertOperations('accept')
    log.info('Accepted alert popup.')
  }

  const dismissAlert = async () => {
    await genericAlertOperations('dismiss')
    log.info('Dismissed alert popup.')
  }

  const getAlertText = async () => {
    log.debug('Getting text in alert popup.')
    const actualValue = await genericAlertOperations('text')
    log.info(`${actualValue} is displayed in the alert popup.`)
    return actualValue
  }

  const assertAlertText = async (expectedValue) => {
    log.debug('Asserting text in alert popup.')
    const actualValue = await genericAlertOperations('text')
    if (actualValue === expectedValue) {
      log.info(
        `Actual value "${actualValue}" matches Expected value "${expectedValue}". PASS`,
      )
    } else {
      assert.fail(
        `Actual value "${actualValue}" does not match Expected value "${expectedValue}". FAIL`,
      )
    }
  }

  const assertAlertTextIncludes = async (expectedValue) => {
    log.debug('Asserting text in alert popup.')
    const actualValue = await genericAlertOperations('text')
    if (actualValue.includes(expectedValue)) {
      log.info(
        `Actual value "${actualValue}" includes Expected value "${expectedValue}". PASS`,
      )
    } else {
      assert.fail(
        `Actual value "${actualValue}" does not include Expected value "${expectedValue}". FAIL`,
      )
    }
  }

  const dragAndDrop = async (
    dragElementName,
    dropElementName,
    dragReplaceText,
    dropReplaceText,
  ) => {
    let From
    let To
    let WebElementObject = ''
    let WebElementData = {}

    const fromElementName = await addDynamicElement(
      dropElementName,
      dropReplaceText,
    )
    const toElementName = await addDynamicElement(
      dropElementName,
      dropReplaceText,
    )
    await assertElementExists(fromElementName)
    await assertElementExists(toElementName)
    if (await hasElement(fromElementName)) {
      WebElementData = await getElement(fromElementName)
      await switchFrame(WebElementData.frame)
      WebElementObject = new WebElement(that.driver, WebElementData)
      await WebElementObject.scrollIntoView()
      From = await WebElementObject.getWebElement()
    }
    if (await hasElement(toElementName)) {
      WebElementData = await getElement(toElementName)
      await switchFrame(WebElementData.frame)
      WebElementObject = new WebElement(that.driver, WebElementData)
      await WebElementObject.scrollIntoView()
      To = await WebElementObject.getWebElement()
    }
    try {
      const actions = that.driver.actions({ bridge: true })
      await actions.dragAndDrop(From, To).perform()
      log.debug(
        `Dropped element "${fromElementName}" on element "${toElementName}". PASS`,
      )
    } catch (err) {
      assert.fail(
        `Unable to perform drag and drop operation due to error. FAIL. Error ${err}`,
      )
    }
  }

  that.acceptAlert = acceptAlert
  that.dismissAlert = dismissAlert
  that.getAlertText = getAlertText
  that.assertAlertText = assertAlertText
  that.assertAlertTextIncludes = assertAlertTextIncludes
  that.assertText = assertText
  that.assertTextIncludes = assertTextIncludes
  that.assertTextDoesNotInclude = assertTextDoesNotInclude
  that.assertElementDisabled = assertElementDisabled
  that.getElement = getElement
  that.hasElement = hasElement
  that.getDriver = getDriver
  that.populate = populateElement
  that.click = clickElement
  that.getAttributeValue = getAttributeValue
  that.populateFromDataTable = genericPopulateDatable
  that.populateDatatable = genericPopulateDatable
  that.checkElementExists = checkElementExists
  that.assertElementExists = assertElementExists
  that.assertElementDoesNotExist = assertElementDoesNotExist
  that.getWebElements = getWebElements
  // that.generateDataTable = generateDataTable;
  that.scrollElementIntoView = scrollElementIntoView
  that.getText = getText
  that.switchToTab = switchToTab
  that.closeTab = closeTab
  that.getCurrentURL = getCurrentURL
  that.getPageTitle = getPageTitle
  that.assertPageTitle = assertPageTitle
  that.assertPageTitleIncludes = assertPageTitleIncludes
  that.addDynamicElement = addDynamicElement
  that.waitForElementVisibility = waitForElementVisibility
  that.waitForElementInvisibility = waitForElementInvisibility
  that.dragAndDrop = dragAndDrop
  loadPageDefinitionFile(that.pageDefinitionFileName)
  return that
}

module.exports = PageObject
