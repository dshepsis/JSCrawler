function logObjToString (logObj) {
  let substitutedLogObj = {};

  /* Each logging Object is an object mapping page urls (with anchor
   * removed) to arrays of objects. Each object in the array maps
   * the url of the page which contained a link to the key url to the
   * actual link element object (HTMLAnchorElement) which is referred
   * to. So, we parse in the form of: object -> array -> object. */
  for (let link in logObj) { // <--------------------------- Outer Object
    // console.warn(`link: ${link}`); //@debug
    let srcArr = logObj[link];
    // console.warn(`srcArr`, srcArr); //@debug
    let transformedArr = [];
    for (let i = 0, len = srcArr.length; i < len; ++i) { // <- Array
      let srcObj = srcArr[i];
      // console.warn(`srcObj:`, srcObj);
      let transformedObj = {};
      for (let key in srcObj) { // <-------------------------- Inner Object
        // console.warn(`key: ${key}`); //@debug
        transformedObj[key] = srcObj[key].getAttribute("href");
      }
      transformedArr.push(transformedObj);
    }
    substitutedLogObj[link] = transformedArr;
  }
  let logObjJSON = JSON.stringify(substitutedLogObj, null, 2);

  /* Put objects which only have one key:value pair on a single line, rather
   * than putting the opening bracket and closing bracket on separate lines: */
  logObjJSON = logObjJSON.replace(
      /(^[^\S\r\n]*\{)[^\S\r\n]*$[\r\n]*^\s*([^\r\n}]+$)[\r\n]*^\s*(\})/gm,
      "$1$2$3"
  );

  return logObjJSON;
}

/* Cuts the parameter string off at the given number of characters. If the
 * parameter string is already shorter than maxLen, it is returned  without
 * modification.
 *
 * Optionally, you may specify a break-string at which the string will be cut.
 * If you do, the string will be cut just before the last instance of breakStr
 * before the cutoff-point. If no instance can be found, an empty string is
 * returned. */
function cutOff(str, maxLen, breakStr) {
  let cutOffPoint = maxLen;
  /* If the string is already shorter than maxLen: */
  if (cutOffPoint > str.length) return str;
  /* If not break-string is given, cutOffPoint right on the character: */
  if (breakStr === undefined) return str.substring(0, cutOffPoint);

  cutOffPoint = str.lastIndexOf(breakStr, cutOffPoint);
  /* If the breakStr character can't be found, return an empty string: */
  if (cutOffPoint === -1) return "";
  return str.substring(0, cutOffPoint);
}
