'use strict';
const startTime = performance.now();

/* Polyfill iteration on HTMLCollections for Edge and other browsers: */
(function() {
  const getIter = (cnstr) => cnstr.prototype[Symbol.iterator];
  const createIter = (cnstr) => {
    if (!getIter(cnstr)) {
      cnstr.prototype[Symbol.iterator] = getIter(Array);
    }
  };
  [HTMLCollection, NodeList].forEach(createIter);
}());

/* A helper function which throws a pre-baked error message when the parameter
 * ambiguousVar does not match the type specified by desiredType: */
function validateType(ambiguousVar, desiredType, nameStr = "variable") {
  /* Validate the type of nameStr: */
  if (typeof nameStr !== 'string') {
    throw new TypeError(
      `nameStr must be a string. Instead, its type was '${typeof nameStr}'.`
    );
  }

  let isCorrectType = false;
  let desiredTypeStr;
  const validationStyle = typeof desiredType;

  /* Check whether we are validating the type against a string (with typeof) or
   * a constructor function (with instanceof): */
  if (validationStyle === 'string') {
    isCorrectType = (typeof ambiguousVar === desiredType);
    desiredTypeStr = desiredType;
  } else if (
    validationStyle === 'function' &&
    desiredType.prototype !== undefined
  ) {
    desiredTypeStr = desiredType.name;
    isCorrectType = (ambiguousVar instanceof desiredType);
  } else {
    /* Throw a TypeError because desiredType has an invalid type: */
    throw new TypeError(
      `desiredType must be a string (matching the typeof to validate against) `+
      `or a constructor function (matching the instanceof to `+
      `validate against). Instead, its type was: ${validationStyle}.`
    );
  }
  /* Type is valid, so return the variable: */
  if (isCorrectType) {
    return ambiguousVar;
  }
  /* Type is invalid, so throw an error: */
  let wrongType = typeof ambiguousVar;

  /* Special case for null, which has type 'object' for legacy reasons: */
  if (ambiguousVar === null) wrongType = "null pointer";

  /* If ambiguousVar is an object, report its constructor name for better
   * clarity in the error message: */
  else if (wrongType === 'object') wrongType = ambiguousVar.constructor.name;

  /* Actually throw the meaningful error: */
  throw new TypeError(
    `${nameStr} must be of type "${desiredTypeStr}"! `+
    `Instead, it was of type "${wrongType}".`
  );
}

/* Warn the user about navigating away during crawl: */
window.addEventListener("beforeunload", function (e) {
  /* Note: In modern browsers, these messages are ignored as a security feature,
   * and a default message is displayed instead. */
  const confirmationMessage = (
    "Warning: Navigating away from the page during a site-crawl will cancel "+
    "the crawl, losing all progress. Are you sure you want to continue?"
  );
  e.returnValue = confirmationMessage;     // Gecko, Trident, Chrome 34+
  return confirmationMessage;              // Gecko, WebKit, Chrome lt34
});

const DOMAIN = window.location.origin;
const HOSTNAME = window.location.hostname.toLowerCase();
const PROTOCOL = window.location.protocol;


/* Settings variables: */
const RECOGNIZED_FILE_TYPES = [
  "doc", "docx", "gif", "jpeg", "jpg", "pdf",
  "png", "ppt", "pptx", "xls", "xlsm", "xlsx"
];
const RECOGNIZED_SCHEMES = ["mailto:", "file:", "tel:", "javascript:"];

const BANNED_STRINGS = {
  list: ["drupaldev"],
  forceBanned: null,
  isStringBanned(str) {
    if (this.forceBanned !== null) {
      validateType(this.forceBanned, 'boolean', "Banned string forced value");
      return this.forceBanned;
    }
    for (let i = 0, len = this.list.length; i < len; ++i) {
      const bannedStr = this.list[i];
      if (str.toLowerCase().indexOf(bannedStr.toLowerCase()) !== -1) {
        return bannedStr;
      }
    }
    return false;
  }
};

const MAX_TIMEOUT = 60*1000; //Miliseconds
let crawlTerminatedBeforeCompletion = false;
const allRequests = [];

/* A function which aborts any live requests at the time of execution: */
const QUIT = (noisy)=>{
  crawlTerminatedBeforeCompletion = true;
  for (let r = 0, len = allRequests.length; r < len; ++r) {
    const request = allRequests[r];

    /* If the request has already completed, don't abort it */
    if (request.readyState === 4) continue;
    request.abortedDueToTimeout = true;
    request.abort();
    if (noisy) {
      console.warn(`Aborting request at index ${r} of allRequests`);
    }
  }
};
/* Aliasing, so that a user can more easily stop a runaway crawl: */
// const Quit = QUIT; const quit = QUIT;
// const EXIT = QUIT; const Exit = QUIT; const exit = QUIT;

/* Set a timer to end all live requests when the timer is reached. */
const TIMEOUT_TIMER = window.setTimeout(()=>QUIT(true), MAX_TIMEOUT);

function urlRemoveAnchor(locationObj) {
  if (typeof locationObj === 'string') {
    /* For some reason, creating a link with an empty string for an href makes
     * that link think it refers to the current page. In other words, an empty
     * href behaves like "/". So we have to manually avoid this behavior to
     * avoid associating a null link with a refresh link. */
    if (locationObj === "") return "";
    return urlRemoveAnchor(makeElement("a", undefined, {href: locationObj}));
  }
  let origin = locationObj.origin;

  /* In Microsoft Edge, HTMLAnchorElement.origin is undefined.
   * See this issue, which is incorrectly marked closed as of this writing:
   * https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/12236493/
   */
  if (origin === undefined) {
    origin = `${locationObj.protocol}//${locationObj.host}`;

    /* For null links: */
    if (origin === '//') origin = '';
  }
  return origin + locationObj.pathname + locationObj.search;
}

/* Because Sets do not store their values directly as own-properties,
 * Object.freeze is not enough to make the Set immutable. We instead have to
 * manually override the mutator functions to throw errors: */
function freezeSet(mySet) {
  mySet.add = function() {
    throw new Error("Cannot add to read only Set.");
  };
  mySet.clear = function () {
    throw new Error("Cannot clear read only Set.");
  };
  mySet.delete = function () {
    throw new Error("Cannot delete from read only Set.");
  };
  Object.freeze(mySet);
  return mySet;
}

/* Defines an unwritable, unconfigurable property on classConstructor, but only
 * if that property doesn't already exist. Returns true on success (the property
 * was created) and false on failure (the property already existed): */
function staticConst(classConstructor, varName, value) {
  if (classConstructor[varName]) {
    return false;
  }
  Object.defineProperty(classConstructor, varName, {
    value: (typeof value === "function") ? value() : value,
    writable: false,
    enumerable: true,
    configurable: false
  });
  return true;
}

/* Checks if obj has a defined property for the key prop. If it does, the
 * the optional onExistence function, if it is defined, is called on that
 * property's value. Then, the value is returned. If there is not a defined
 * value for the given key, the key is assigned the value given by val. If val
 * is a function, it is executed with no parameters, and its return value is
 * used instead. */
const makeIfUndef = function (obj, prop, val, onExistence) {
  const existingVal = obj[prop];
  if (existingVal === undefined) {
    const newVal = (typeof val === "function") ? val() : val;
    obj[prop] = newVal;
    return newVal;
  }
  if (onExistence !== undefined) onExistence(existingVal);
  return existingVal;
};

/* Add the value val to the array specified by obj[arrName]. If there is not a
 * array defined there already, an empty one is made and val is added to it: */
const maybeArrayPush = function (obj, arrName, val) {
  makeIfUndef(obj, arrName, ()=>[]).push(val);
};

/* Returns either an element's href property, or its src property, whichever is
 * isn't undefined. Throws an error if both or neither of them are defined.
 * Note hrefs are returned without an anchor (the part after the #, if present).*/
function getHrefOrSrcProp(ele, retainAnchor) {
  validateType(ele, HTMLElement, "element");
  if ((ele.href !== undefined) && (ele.src  !== undefined)) throw new Error("Element with href AND src!?!"); //@debug
  if (ele.href !== undefined) {
    return (retainAnchor ? ele.href : urlRemoveAnchor(ele));
  }
  if (ele.src  !== undefined) {
    return ele.src;
  }
  throw new TypeError(`elementInDocument must have either an href or a source.`);
}
/* Similar to above, except returns the attribute instead of the property: */
function getHrefOrSrcAttr(ele) {
  validateType(ele, HTMLElement, "element");
  if ((ele.href !== undefined) && (ele.src  !== undefined)) throw new Error("Element with href AND src!?!"); //@debug
  for (const attrName of ["href", "src"]) {
    const attrVal = ele.getAttribute(attrName);
    if (attrVal !== null) return attrVal;
  }
  /* Null links may very well have a null href, so there's no reason to throw an
   * error. */
  return null;
}

/* Labels which apply to all elements in the same group. For example, links
 * are grouped by the page they point to. Two or more links may point to the
 * same page while having different HREFs (e.g. one absolute and one relative),
 * so if one of them 404s (notFound), all of the others will too. */
const GROUP_LABELS = (()=>{
  const gLabels = [
    "internal",
    "external",
    "null",
    "Email",
    "localFile",
    "javascriptLink",
    "http-httpsError",
    "unusualScheme",
    "visited",
    "unknownContentType",
    "redirects",
    "accessDenied",
    "forbidden",
    "notFound",
    "internalServiceError",
    "robotsDisallowed",
    "unloaded",
    "file"
  ];
  const labelSet = freezeSet(new Set(gLabels));

  /* For altering the presentation of data in the results modal: */
  const labelData = {};

  /* Default values: */
  for (const label of gLabels) {
    labelData[label] = {
      getInstancesName: getHrefOrSrcAttr, //For output display
      getLocationsName: getHrefOrSrcProp, //For inverted output display
    };
  }

  return {
    list: gLabels,
    has(label) { return labelSet.has(label); },
    metadata: labelData
  };
})();

/* Groups together element records. This is used for grouping links/images with
 * the same href/src. */
class RecordGroup {
  constructor (name, ...elementRecords) {
    this.name = name;
    this.records = elementRecords;
    this.labels = new Set();
    staticConst(this.constructor, "LabelTable", ()=>Object.create(null));
  }
  static validateLabel (label) {
    if (GROUP_LABELS.has(label)) {
      return label;
    }
    throw new Error(`"${label}" is not a valid record-group label!`);
  }
  addRecord(record) {
    this.records.push(record);
  }
  label(...newLabels) {
    for (const label of newLabels) {
      this.constructor.validateLabel(label);
      if (this.labels.has(label)) continue;
      this.labels.add(label);
      maybeArrayPush(this.constructor.LabelTable, label, this);
    }
  }
  isLabelled(label) {
    return this.labels.has(this.constructor.validateLabel(label));
  }
}

/* Labels which only apply to particular elements, and may differ between
 * elements within the same group: */
const ELEMENT_LABELS = (()=>{
  const eLabels = [
    "link",
    "image",
    "iframe",
    "startPage",
    "bannedString",
    "absoluteInternal",
    "anchor",
    "improperSize",
    "noAltText",
    "emptyTitle",
    "user-selected"
  ];
  const labelSet = freezeSet(new Set(eLabels));

  /* For altering the presentation of data in the results modal: */
  const labelData = {};

  /* Default values: */
  for (const label of eLabels) {
    labelData[label] = {
      getInstancesName: getHrefOrSrcAttr, //For output display
      getLocationsName: getHrefOrSrcProp, //For inverted output display
    };
  }

  /* Custom behavior on a per-label basis: */
  {
    /* For the anchor label, when displaying results in inverted mode (showing
     * a list of pages where each anchor link is located), retain the anchor
     * so that different anchors on the same page have separate lists for pages
     * that link to them: */
    labelData["anchor"].getLocationsName = ele => getHrefOrSrcProp(ele, true);

    /* For user-selected elements (See the CSS-Select flag), display them as
     * truncated HTML, since they may not have an href or src: */
    const getTruncatedOuterHTML = (ele, maxLen = 80) => {
      let trunc = ele.outerHTML;
      if (trunc.length > maxLen) trunc = trunc.substring(0, maxLen) + '...'; //@magic
      return trunc;
    };
    const userSelData = labelData["user-selected"];
    userSelData.getInstancesName = getTruncatedOuterHTML;
    userSelData.getLocationsName = getTruncatedOuterHTML;
  }


  return {
    list: eLabels,
    has(label) { return labelSet.has(label); },
    metadata: labelData
  };
})();

/* Associates a document, set of labels, and a group with a given HTML Element: */
class ElementRecord {
  constructor(documentID, elementInDocument, groupName) {
    /* Default function for converting an element into a string ID: */
    if (groupName === undefined) {
      groupName = getHrefOrSrcProp(elementInDocument);
    } else {//@debug
      console.log("custom groupname: " + groupName);
    }
    /* These two tables are class variables used for retrieving records or
     * groups based on labels or group-names, respectively: */
    staticConst(this.constructor, "GroupTable", ()=>Object.create(null));
    staticConst(this.constructor, "LabelTable", ()=>Object.create(null));

    /* Properties: */
    this.document = documentID;

    /* Clone the element so that we don't have ot hold a reference to the
     * entire document in memory, thus allowing documents to be garbage-
     * collected when they're done being processed: */
    this.element = elementInDocument.cloneNode("Deep");
    // const groupName = eleToGroupName(elementInDocument);
    this.group = makeIfUndef(
      this.constructor.GroupTable,
      groupName,
      ()=>new RecordGroup(groupName)
    );
    this.group.addRecord(this);

    this.labels = new Set();
  }
  static validateLabel (label) {
    if (ELEMENT_LABELS.has(label)) {
      return label;
    }
    throw new Error(`"${label}" is not a valid element-record label.`);
  }
  label(...newLabels) {
    for (const label of newLabels) {
      this.constructor.validateLabel(label);
      if (this.labels.has(label)) continue;
      this.labels.add(label);
      maybeArrayPush(this.constructor.LabelTable, label, this);
    }
  }
  isLabelled(label) {
    return this.labels.has(this.constructor.validateLabel(label));
  }
}

/* Returns an array of all records matching a label, regardless of whether that
 * label is an element or group label. For group labels, each matching group
 * has all of its member records appended to the returned list. */
const getAllRecordsLabelled = (label)=>{
  let recordList;
  if (ELEMENT_LABELS.has(label)) {
    const tableEntry = ElementRecord.LabelTable[label];
    if (tableEntry === undefined) return null;

    /* Shallow copy array, for consistency with group-label behvaior.
     * That is to say, modifying the returned list will not affect the actual
     * record tables. */
    recordList = tableEntry.slice(0);
  } else if (GROUP_LABELS.has(label)) {
    recordList = [];
    const groups = RecordGroup.LabelTable[label];
    if (groups === undefined) return null;

    /* Take each matching group, and then append each group's list of records
     * to recordList. This gives us every record in a group matching a given
     * group label: */
    for (const group of groups) {
      for (const record of group.records) recordList.push(record);
    }
  } else {
    /* If there is no matching label for either elements or groups: */
    return null;
  }
  return recordList;
};

/**
 * DOM Manipulation
 */

/* A function for appending an array of children to a parent HTMLElement: */
function appendChildren(parent, children) {
  function appendItem(item) {
    if (item instanceof HTMLElement) {
      parent.appendChild(item);
    }
    /* Otherwise, coerce item into a string and make a text node out of it.
    * Then, append that text node to parent: */
    else {
      const text = document.createTextNode(String(item));
      parent.appendChild(text);
    }
  }
  if (Array.isArray(children)) {
    for (let i = 0, len = children.length; i < len; ++i) {
      appendItem(children[i]);
    }
  } else {
    appendItem(children);
  }
}
/* Makes an HTML element with content. This is similar to the
 * document.createElement() method, but allows text or other elements to
 * be added as a child in-place. Multiple children may be specified by
 * using an array. The optional attrObj parameter allows for attributes
 * such as id, class, src, and href to also be specified in-place.
 */
function makeElement(type, content, attrObj) {
  const newEle = document.createElement(type);
  if (content !== undefined) {
    appendChildren(newEle, content);
  }
  if (attrObj !== undefined) {
    validateType(attrObj, 'object', "Attribute Object");
    for (const attribute of Object.keys(attrObj)) {
      newEle.setAttribute(attribute, attrObj[attribute]);
    }
  }
  return newEle;
}
/* Removes all of an element's immediate children: */
function clearChildren(parent) {
  while (parent.firstChild !== null) {
    parent.removeChild(parent.firstChild);
  }
}

/* Make new style sheet for modal:
 *
 * NOTE: This CSS is a minified version of the CSS found in crlr.js.css. If
 *   you want to make changes to it, edit that file and minify it before
 *   pasting it here. */
const CRAWLER_CSS = `#crlr-modal,#crlr-modal *{all:initial;margin:initial;padding:initial;border:initial;border-radius:initial;display:initial;position:initial;height:initial;width:initial;background:initial;float:initial;clear:initial;font:initial;line-height:initial;letter-spacing:initial;overflow:initial;text-align:initial;vertical-align:initial;text-decoration:initial;visibility:initial;z-index:initial;box-shadow:initial;box-sizing:border-box}#crlr-modal h1,#crlr-modal h2,#crlr-modal h3,#crlr-modal h4,#crlr-modal h5,#crlr-modal h6,#crlr-modal strong{font-weight:700}#crlr-modal address,#crlr-modal blockquote,#crlr-modal div,#crlr-modal dl,#crlr-modal fieldset,#crlr-modal form,#crlr-modal h1,#crlr-modal h2,#crlr-modal h3,#crlr-modal h4,#crlr-modal h5,#crlr-modal h6,#crlr-modal hr,#crlr-modal noscript,#crlr-modal ol,#crlr-modal p,#crlr-modal pre,#crlr-modal table,#crlr-modal ul{display:block}#crlr-modal h1{font-size:2em;margin-top:.67em;margin-bottom:.67em}#crlr-modal h2{font-size:1.5em;margin-top:.83em;margin-bottom:.83em}#crlr-modal h3{font-size:1.17em;margin-top:1em;margin-bottom:1em}#crlr-modal h4{margin-top:1.33em;margin-bottom:1.33em}#crlr-modal h5{font-size:.83em;margin-top:1.67em;margin-bottom:1.67em}#crlr-modal h6{font-size:.67em;margin-top:2.33em;margin-bottom:2.33em}#crlr-modal *{font-family:sans-serif;color:inherit}#crlr-modal pre,#crlr-modal pre *{font-family:monospace;white-space:pre}#crlr-modal a:link{color:#00e;text-decoration:underline}#crlr-modal a:visited{color:#551a8b}#crlr-modal a:hover{color:#8b0000}#crlr-modal a:active{color:red}#crlr-modal a:focus{outline:#a6c7ff dotted 2px}#crlr-modal{border:5px solid #0000a3;border-radius:1em;background-color:#fcfcfe;position:fixed;z-index:99999999999999;top:2em;bottom:2em;left:2em;right:2em;margin:0;overflow:hidden;color:#222;box-shadow:2px 2px 6px 1px rgba(0,0,0,.4);display:flex;flex-direction:column}#crlr-modal.waiting-for-results{bottom:auto;right:auto;display:table;padding:1em}#crlr-modal #crlr-min{border:1px solid gray;padding:.5em;border-radius:5px;background-color:rgba(0,0,20,.1);align-self:flex-start}#crlr-modal #crlr-min:hover{border-color:#00f;background-color:rgba(0,0,20,.2)}#crlr-modal #crlr-min:focus{box-shadow:0 0 0 1px #a6c7ff;border-color:#a6c7ff}#crlr-modal .flex-row{display:flex}#crlr-modal .flex-row>*{margin-top:0;margin-bottom:0;margin-right:16px}#crlr-modal .flex-row>:last-child{margin-right:0}#crlr-modal #crlr-header{align-items:flex-end;padding:.5em;border-bottom:1px dotted grey;width:100%;background-color:#e1e1ea}#crlr-modal #crlr-header #crlr-header-msg{align-items:baseline}#crlr-modal #crlr-content{flex:1;padding:1em;overflow-y:auto;overflow-x:hidden}#crlr-modal #crlr-content>*{margin-top:0;margin-bottom:10px}#crlr-modal #crlr-content>:last-child{margin-bottom:0}#crlr-modal.minimized :not(#crlr-min){display:none}#crlr-modal.minimized #crlr-header{display:flex;margin:0;border:none;background-color:transparent}#crlr-modal.minimized{display:table;background-color:#e1e1ea;opacity:.2;transition:opacity .2s}#crlr-modal.minimized.focus-within,#crlr-modal.minimized:hover{opacity:1}#crlr-modal.minimized #crlr-min{margin:0}#crlr-modal #crlr-inputs{align-items:baseline}#crlr-modal #crlr-inputs *{font-size:25px}#crlr-modal #crlr-input-clear{margin-right:.25em;padding:0 .25em;border:none;font-size:1em;text-shadow:.5px 1px 2px rgba(0,0,0,.4)}#crlr-modal #crlr-input-clear:active{box-shadow:inset 1px 1px 2px 1px rgba(0,0,0,.25);text-shadow:none}#crlr-modal #crlr-input-clear:focus{outline:#a6c7ff solid 2px}#crlr-modal #crlr-textbox-controls{background-color:#ededf2;padding:2px;box-shadow:inset 0 -2px 0 0 #b0b0b0;transition:box-shadow .2s}#crlr-modal #crlr-textbox-controls.focus-within{box-shadow:inset 0 0 0 2px #a6c7ff}#crlr-modal #crlr-input-textbox{background-color:transparent;width:300px;border:none}#crlr-modal #crlr-textbox-suggestions-container{display:inline;position:relative;font-size:1em}#crlr-modal #crlr-textbox-suggestions-container *{font-size:1em}#crlr-modal #crlr-suggestions{margin:0 0 0 -2px;padding:5px;font-size:.8em;border:1px solid gray;position:absolute;background-color:#fff;z-index:1;width:100%;display:table;table-layout:fixed;border-collapse:collapse}#crlr-modal #crlr-suggestions tr{display:table-row}#crlr-modal #crlr-suggestions td{padding:5px;display:table-cell;text-overflow:ellipsis}#crlr-modal #crlr-suggestions .crlr-suggestion-info{font-size:.7em;text-align:right;vertical-align:middle}#crlr-modal #crlr-suggestions.hidden{display:none}#crlr-modal #crlr-input-textbox:focus~#crlr-suggestions>.crlr-suggestion-row:first-child,#crlr-modal #crlr-suggestions>.crlr-suggestion-row:focus{background-color:#add8e6}#crlr-suggestions>.crlr-suggestion-row.empty-suggestion{color:gray}#crlr-modal input[type=checkbox]{opacity:0;margin:0}#crlr-modal input[type=checkbox]+label{padding-top:.1em;padding-bottom:.1em;padding-left:1.75em;position:relative;align-self:center}#crlr-modal input[type=checkbox]+label::before{position:absolute;left:.125em;height:1.4em;top:0;border:1px solid gray;padding:0 .2em;line-height:1.4em;background-color:#e1e1ea;content:"✓";font-weight:700;color:transparent;display:block}#crlr-modal input[type=checkbox]:checked+label::before{color:#222}#crlr-modal input[type=checkbox]:focus+label::before{box-shadow:0 0 0 1px #a6c7ff;border-color:#a6c7ff}#crlr-modal input[type=checkbox]:active+label::before{box-shadow:inset 1px 1px 2px 1px rgba(0,0,0,.25)}#crlr-modal .crlr-output{display:inline-block;max-width:100%}#crlr-modal .crlr-output>pre{max-height:400px;padding:.5em;margin:0;overflow:auto;border:1px dashed gray;background-color:#e1e1ea}`;
const styleEle = makeElement("style", CRAWLER_CSS, {id: "crlr.js.css"});
document.head.appendChild(styleEle);

/* Make modal element: */
const MODAL = makeElement("div", undefined, {id: "crlr-modal"});

/* Pseudo-polyfill for browsers without support for :focus-within: */
const getDOMDepthInModal = (ele)=>{
  let depth = 0;
  let isInModal = false;
  for (let anc = ele; anc !== null; anc = anc.parentElement) {
    isInModal = isInModal || (anc === MODAL);
    ++depth;
  }
  return [depth, isInModal];
};
const getPathToMutualAncestorInModal = (a, b)=>{
  const [depthA, aInModal] = getDOMDepthInModal(a);
  const [depthB, bInModal] = getDOMDepthInModal(b);

  const fromA = [];
  const fromB = [];
  if (aInModal) {
    if (!bInModal) {
      for (let aAnc = a; aAnc !== MODAL; aAnc = aAnc.parentElement) {
        fromA.push(aAnc);
      }
      return [fromA, fromB];
    }
    const depthDiff = depthA - depthB;
    let aAnc = a;
    let bAnc = b;
    if (depthDiff > 0) {
      for (let i = depthDiff; i > 0; --i) {
        fromA.push(aAnc);
        aAnc = aAnc.parentElement;
      }
    } else {
      for (let i = depthDiff; i < 0; ++i) {
        fromB.push(bAnc);
        bAnc = bAnc.parentElement;
      }
    }
    while (aAnc !== bAnc) {
      fromA.push(aAnc);
      fromB.push(bAnc);
      aAnc = aAnc.parentElement;
      bAnc = bAnc.parentElement;
    }
    return [fromA, fromB];
  } else if (bInModal) {
    for (let bAnc = b; bAnc !== MODAL; bAnc = bAnc.parentElement) {
      fromB.push(bAnc);
    }
  }
  return [fromA, fromB];
};
MODAL.addEventListener(
  "focusin",
  function addFocus(e) {
    const [gettingFocus, losingFocus] = getPathToMutualAncestorInModal(
      e.target,
      e.relatedTarget
    );
    window.requestAnimationFrame(()=>{
      MODAL.classList.add('focus-within');
      for (const ele of gettingFocus) {
        ele.classList.add('focus-within');
      }
      for (const ele of losingFocus) {
        ele.classList.remove('focus-within');
      }
    });
  }
);
MODAL.addEventListener(
  "focusout",
  /* Most stuff is already handled by the focusin listener above. The only case
   * left is focus being taken away from an element in the modal to an element
   * outside it, which is handled here: */
  function remFocus(e) {
    const [, focusWithinModal] = getDOMDepthInModal(e.relatedTarget);
    if (focusWithinModal) return;

    let anc = e.target;
    window.requestAnimationFrame(()=>{
      MODAL.classList.remove('focus-within');
      while (anc !== MODAL) {
        anc.classList.remove("focus-within");
        anc = anc.parentElement;
      }
      MODAL.classList.remove("focus-within");
    });
  }
);

document.body.insertBefore(MODAL, document.body.childNodes[0]);

/* Prevent click events on the modal triggering events on the rest of the page: */
const cancelBubble = (e)=>{
  if (!e) e = window.event;
  e.cancelBubble = true;
  if (e.stopPropagation) e.stopPropagation();
};
MODAL.addEventListener("click", cancelBubble);
MODAL.addEventListener("keydown", cancelBubble);
MODAL.addEventListener("keypress", cancelBubble);

/* Adds a counter to the modal, showing the number of live (unresolved) http
 * requests currently waiting: */
const requestCounter = (function() {
  /* Create display: */
  const disp = makeElement("p", undefined, {
    id: "request-counter",
    title: "Number of page requests currently loading"
  });
  const waitingClassString = "waiting-for-results";
  let initialized = false;
  /* Methods to allow other code to affect the counter: */
  const API = {
    displayElement: disp,
    count: 0,
    update() {
      /* To avoid repainting more often than necessary: */
      window.requestAnimationFrame(()=>{
        disp.innerHTML = `Requests: ${this.count}`;
      });
      if (initialized && this.count === 0) {
        this.setText("All requests complete!");
        window.clearTimeout(TIMEOUT_TIMER);
        presentResults();
      }
    },
    increment() {
      ++this.count; this.update();
    },
    decrement() {
      if (this.count <= 0) {
        throw new Error("DECREMENTED COUNTER BELOW ZERO");
      }
      --this.count; this.update();
    },
    setText(text) {
      disp.innerHTML = text;
    },
    remove() {
      MODAL.removeChild(disp);
      MODAL.classList.remove(waitingClassString);
    }
  };
  API.update();
  MODAL.classList.add(waitingClassString);
  MODAL.appendChild(disp);
  initialized = true;
  return API;
}());

/**
 * Crawling functions:
 */

/* Finds all of the links in a document and classifies them
 * based on the contents of their hrefs: */
function classifyLinks(doc, curPageURL) {
  const LINKS = doc.getElementsByTagName("a");

  /* Contains the URLs of all of the local (same-domain) pages linked to from
   * this page: */
  const internalLinksFromThisPage = [];

  /* A quick function for visibly labelling certain types of elements: */
  function markElement(ele, color, text) {
    ele.style.outline = `2px solid ${color}`;
    if (ele.title) ele.title += "\n";
    ele.title += text;
  }

  /* Loop over links: */
  for (const link of LINKS) {
    const hrefAttr = link.getAttribute("href");
    const linkRecord = new ElementRecord(curPageURL, link);
    linkRecord.label("link");

    /* Handle links with no HREF attribute, such as anchors or those used as
    * buttons: */
    if (hrefAttr === null) {
      linkRecord.group.label("null");
      markElement(link, "orange", "Null link");
      continue;
    }
    const bannedStr = BANNED_STRINGS.isStringBanned(link.href);
    if (bannedStr) {
      linkRecord.label("bannedString");
      console.error(
        `Found link ${hrefAttr} containing a banned string: ${bannedStr}.\n\t`+
        `Linked-to from: ${curPageURL}`
      );
      markElement(link, "red", "BANNED STRING LINK");

      /* Don't parse the link further. Banned-string links will not be crawled. */
      continue;
    }

    const linkIsAbsolute = (hrefAttr === link.href.toLowerCase());
    const linkProtocol = link.protocol.toLowerCase();
    const linkIsToWebsite = /^https?:$/i.test(linkProtocol);
    const linkIsInternal =
        (linkIsToWebsite && (link.hostname.toLowerCase() === HOSTNAME));

    /* Anchor link: */
    if (link.hash !== "") {
      linkRecord.label("anchor");
      markElement(link, "pink", "Anchor link");
    }
    if (linkIsInternal) {
      linkRecord.group.label("internal");
      if (linkProtocol === PROTOCOL) {
        /* Store this record for return, because it is internal with a matching
         * protocol, so its page should be checked in visitLinks: */
        internalLinksFromThisPage.push(linkRecord);
      } else {
        linkRecord.group.label("http-httpsError");
      }
      if (linkIsAbsolute) {
        if (link.matches(".field-name-field-related-links a")) {
          console.warn("absint link in related links", link);
          continue; //@debug
        }
        linkRecord.label("absoluteInternal");
      }
    } else if (linkIsToWebsite) {
      linkRecord.group.label("external");
    } else {
      if (RECOGNIZED_SCHEMES.indexOf(linkProtocol) === -1) {
        linkRecord.group.label("unusualScheme");
        markElement(link, "gray", "Unusual Scheme");
      }
      switch (linkProtocol) {
        case "mailto:":
          linkRecord.group.label("Email");
          markElement(link, "yellow", "Email link");
          break;
        case "file:":
          linkRecord.group.label("localFile");
          markElement(link, "blue", "File link");
          break;
        case "javascript:":
          linkRecord.group.label("javascriptLink");
          break;
        case "tel:":
          markElement(link, "darkBlue", "Telephone Link");
          break;
        default:
          markElement(link, "darkGray", "Unusual Scheme");
      }
    }
  } //Close for loop iterating over link elements
  return internalLinksFromThisPage;
} //Close function classifyLinks

class ImageLoader {
  constructor(src) {
    staticConst(this.constructor, "SrcTable", ()=>Object.create(null));

    /* If another ImageLoader has been created for the given src, reuse it: */
    const existingLoader = this.constructor.SrcTable[src];
    if (existingLoader !== undefined) {
      return existingLoader;
    }
    this.constructor.SrcTable[src] = this;
    this.element = makeElement("img");
    this.loaded = this.errored = false;

    /* For the timeout and quit function, so that ImageLoaders can be
     * treated identically to XMLHttpRequests: */
    this.readyState = 0;
    requestCounter.increment();
    allRequests.push(this);
    this.element.onload = ()=>{
      this.loaded  = true;
      this.readyState = 4;
      requestCounter.decrement();
    };
    this.element.onerror = ()=>{
      this.errored = true;
      this.readyState = 4;
      requestCounter.decrement();
    };
    /* Set the src attribute last to guarantee loading doesn't begin until the
     * onload/error event handlers have been set: */
    this.element.setAttribute("src", src);
  }
  whenReady(normCallback, errCallback) {
    /* If the image has already loaded or errored, we still want the callbacks
     * to be executed asynchronously (for consistency). However, we don't want
     * the resultsModal to show up while one of these callbacks is waiting to
     * fire, so we treat each such callback as a tiny little request. This
     * function automatically increments the requestCounter synchronously, to
     * block the modal, and decrements it after the callback has fired: */
    const wrapAsRequest = (func)=>{
      requestCounter.increment();
      const reqObj = {readyState: 0};
      const timer = window.setTimeout(()=>{
        func();
        reqObj.readyState = 4;
        requestCounter.decrement();
      });
      reqObj.abort = function() {
        if (reqObj.readyState === 4) return;
        reqObj.readyState = 4;
        window.clearTimeout(timer);
        requestCounter.decrement();
      };
      allRequests.push(reqObj);
    };
    if      (this.loaded)  wrapAsRequest(normCallback);
    else if (this.errored) wrapAsRequest(errCallback);
    else {
      /* When multiple events are queued using addEventListener, they are
       * executed **synchronously** in the order of attachment. Since control
       * flow can't be yielded between event handlers, we don't have to worry
       * about incrementing and decrementing the requestCounter for each one. */
      this.element.addEventListener("load", normCallback);
      if (errCallback !== undefined) {
        this.element.addEventListener("error", errCallback);
      }
    }
  }
  abort() {
    if (!(this.loaded || this.errored)) {
      /* Removing the src attribute does not fire the onerror event, so we must
       * manually decrement the requestCounter: */
      this.element.removeAttribute("src");
      requestCounter.decrement();
    }
  }
}

function classifyImages(doc, curPageURL) {
  const IMAGES = doc.getElementsByTagName("img");
  for (const image of IMAGES) {
    const imageRecord = new ElementRecord(curPageURL, image);
    imageRecord.label("image");
    const srcProp = image.src;
    const srcAttr = image.getAttribute("src");
    if (srcAttr === null) {
      imageRecord.group.label("null");
      continue;
    }
    /* Images don't naturally have location properties, so use the URL api: */
    const imgLocation = new URL(srcProp);
    const imgSrcHostname = imgLocation.hostname.toLowerCase();
    const isInternal = (imgSrcHostname === HOSTNAME);

    /* Unfortunately, whether an image is available or broken must be determined
     * asynchronously: */
    const imgLoader = new ImageLoader(image.src);
    if (!imageRecord.group.isLabelled("visited")) {
      const onload = ()=>{
        imageRecord.group.label("visited");
      };
      const onerror = ()=>{
        imageRecord.group.label("unloaded", "visited");
      };
      imgLoader.whenReady(onload, onerror);
    }
    /* Check whether the displayed size of this particular img element matches
    * the native size of this image: */
    const widthAttr =  image.getAttribute("width");
    const heightAttr = image.getAttribute("height");
    const anyDimensionsSpecified = (widthAttr !== null || heightAttr !== null);
    const compareImageSize = ()=>{
      const loadEle = imgLoader.element;
      const widthMatches = (
        widthAttr === null ||
        Number(widthAttr) === loadEle.naturalWidth
      );
      const heightMatches = (
        heightAttr === null ||
        Number(heightAttr) === loadEle.naturalHeight
      );
      if (!(widthMatches && heightMatches)) {
        imageRecord.label("improperSize");
      }
    };
    if (anyDimensionsSpecified) {
      imgLoader.whenReady(compareImageSize, ()=>{
        imageRecord.group.label("unloaded");
      });
    }

    if (!image.alt) {
    //if (image.getAttribute("alt") === null) {
      imageRecord.label("noAltText");
    }
    if (BANNED_STRINGS.isStringBanned(srcProp)) {
      imageRecord.label("bannedString");
    }
    if (isInternal) {
      imageRecord.group.label("internal");
      if (srcProp === srcAttr) {
        imageRecord.label("absoluteInternal");
      }
    } else {
      imageRecord.group.label("external");
    }

    if (imgLocation.protocol === 'file:') {
      imageRecord.group.label("localFile");
    } else if (imgLocation.protocol !== PROTOCOL){
      imageRecord.group.label("http-httpsError");
    }
  }//Close for loop iterating over images
}//Close function classifyImages

const USER_SELECTOR = {
  selector: null,
};
function classifyOther(doc, curPageURL) {
  const IFRAMES = doc.getElementsByTagName("iframe");
  for (const iframe of IFRAMES) {
    const eleRecord = new ElementRecord(curPageURL, iframe);
    eleRecord.label("iframe");

    const srcProp = iframe.src;
    const srcAttr = iframe.getAttribute("src");
    if (srcAttr === null) {
      eleRecord.group.label("null");
      continue;
    }
    const iframeLocation = new URL(srcProp);
    const iframeSrcHostname = iframeLocation.hostname.toLowerCase();
    const isInternal = (iframeSrcHostname === HOSTNAME);

    if (!iframe.title) {
      eleRecord.label("emptyTitle");
    }
    if (BANNED_STRINGS.isStringBanned(srcProp)) {
      eleRecord.label("bannedString");
    }
    if (isInternal) {
      eleRecord.group.label("internal");
      if (srcProp === srcAttr) {
        eleRecord.label("absoluteInternal");
      }
    } else {
      eleRecord.group.label("external");
    }

    if (iframeLocation.protocol === 'file:') {
      eleRecord.group.label("localFile");
    } else if (iframeLocation.protocol !== PROTOCOL){
      eleRecord.group.label("http-httpsError");
    }
  }//Close for loop iterating over iframes

  /* See the CSS-Select flag: */
  if (USER_SELECTOR === null) return;
  const USER_SELECTED = doc.querySelectorAll(USER_SELECTOR.selector);
  for (const userEle of USER_SELECTED) {
    /* The groupname should not matter, but we'll use the tagName for fun: */
    const eleRecord = new ElementRecord(curPageURL, userEle, userEle.tagName);
    eleRecord.label("user-selected");
  }
}//Close function classifyOther

/* Makes requests to the HREFs of links in LinkElementList, and handles the
 * results of the request.
 *
 * Each valid document response is parsed by classifyLinks (and images) to
 * generate a new list of internal URLs, each of which is checked recursively.
 *
 * The same page will not be requested twice. */
function visitLinks(RecordList, curPage, robotsTxt, recursive) {
  /* Parameter defaults:
   * If no robots.txt handler is passed, just create one which will assume all
   * crawling is allowed: */
  if (robotsTxt === undefined) {
    robotsTxt = new RobotsTxt();
    robotsTxt.ignoreFile = true;
  }
  if (recursive === undefined) {
    recursive = true;
  }

  /**
   * Callbacks:
   */

  /* Before the full requested-resource is loaded, we can view the response
   * header for information such as the data type of the resource
   * (e.g. text/html vs application/pdf) and use that information to make
   * decisions on how to proceed w/o having to let the entire file be loaded. */
  const checkRequestHeaders = (pageRecordGroup, request)=>{
    /* Checks if the request resolved to a file rather than an HTML document: */
    function findURLExtension(url) {
      for (let i = url.length - 1; i >= 0; --i) {
        if (url.charAt(i) === ".") return url.substring(i+1).toLowerCase();
      }
      return undefined;
    }
    /* First, check the request's file extension: */
    const extension = findURLExtension(request.responseURL);
    const isRecognizedFile = (RECOGNIZED_FILE_TYPES.indexOf(extension) !== -1);
    if (isRecognizedFile) {
      pageRecordGroup.label("file");
    }
    /* Then, check the request's content-type: */
    const contentType = request.getResponseHeader("Content-Type");
    const validContentType = "text/html";
    if (!contentType.startsWith(validContentType)) {
      if (!isRecognizedFile) {
        pageRecordGroup.label("unknownContentType");
      }
      request.resolvedToFile = true;
      request.abort();
    }
  };

  /* Handle normal, valid page responses: */
  const normalResponseHandler = (pageRecordGroup, pageURL, pageDOM, request)=>{
    if (!pageDOM) {
      console.error(
        "Null response from " + pageURL +
        ". It may be an unrecognized file type." +
        "\n\tIt was linked-to from " + curPage
      );
      console.error(request);
      return;
    }

    if (recursive) {
      /* Check images on the given page: */
      classifyImages(pageDOM, pageURL);
      classifyOther(pageDOM, pageURL);
      /* Recursively check the links found on the given page: */
      const newLinks = classifyLinks(pageDOM, pageURL);
      visitLinks(newLinks, pageURL, robotsTxt);
    }
  };

  /* Handle responses that are errors (e.g. Not Found, Forbidden, etc.): */
  const errorHandler = (pageRecordGroup, pageURL, request)=>{
    /* If we aborted the request early due to the header telling us the
     * resource is a file, we shouldn't log another error, as everything
     * should've already been handled by checkRequestHeaders. */
    if (request.resolvedToFile) return;
    if (request.abortedDueToTimeout) return;

    /* Otherwise, something went wrong with the request: */
    if (request.readyState !== 4) {
      console.error("AN UNIDENTIFIED READYSTATE ERROR OCURRED!", request);
      throw new Error(
        "AN UNIDENTIFIED READYSTATE ERROR OCURRED!" + JSON.stringify(request)
      );
    }

    const errType = request.status;
    const msgHead =
      `A ${errType} Error occurred when requesting ${pageURL}. `;
    let msg = "";
    switch (request.status) {
      case 0:
        pageRecordGroup.label("redirects");
        msg =  `The request to ${pageURL} caused an undefined error. `;
        msg += "The url probably either redirects to an external site, or is ";
        msg += "invalid. There may also be a networking issue, or another ";
        msg += "problem entirely.\nUnfortunately, this script cannot ";
        msg += "distinguish between those possibilities.";
        break;
      case 400:
        pageRecordGroup.label("badRequest");
        msg =  `${msgHead}That means the request sent to the server was `;
        msg += "malformed or corrupted.";
        break;
      case 401:
        pageRecordGroup.label("accessDenied");
        msg =  `${msgHead}That means access was denied to the client by the `;
        msg += "server.";
        break;
      case 403:
        pageRecordGroup.label("forbidden");
        msg =  `${msgHead}That means the server considers access to the `;
        msg += "resource to be absolutely forbidden.";
        break;
      case 404:
        pageRecordGroup.label("notFound");
        msg = `${msgHead}That means the server could not find the given page.`;
        break;
      case 500:
        pageRecordGroup.label("internalServiceError");
        msg =  `${msgHead}That means that the server encountered some unexpected `;
        msg += `condition which prevented it from fulfilling the request.`;
        break;
      default:
        console.error("AN UNIDENTIFIED ERROR OCURRED!", request);
        return;
    }
    console.error(msg + "\n\tLinked-to from: " + curPage);
  };

  /* When the request resolves, regardless of whether the response was an error,
   * mark the request as complete and decrement the request counter: */
  const onComplete = (request)=>{
    request.callbackComplete = true;
    requestCounter.decrement();
  };

  console.log(`Checking links found on: ${curPage}`);
  for (const linkRecord of RecordList) {
    validateType(linkRecord, ElementRecord, "Items in RecordList");
    const URLOfPageToVisit = urlRemoveAnchor(linkRecord.element);

    /* The RecordGroup for linkRecord: */
    const pageData = linkRecord.group;

    /* Check if visiting this link is allowed by the robots.txt handler: */
    if (!robotsTxt.isUrlAllowed(URLOfPageToVisit)) {
      pageData.label("robotsDisallowed");
      continue;
    }
    /* Do not re-analyze a page we have already visited: */
    if (pageData.isLabelled("visited")) {
      continue;
    }
    pageData.label("visited");

    /**
     * Making the HTTP Request:
     */
    const httpRequest = new XMLHttpRequest();
    allRequests.push(httpRequest);

    /* Start filing request: */
    httpRequest.onreadystatechange = function() {
      if (httpRequest.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        checkRequestHeaders(
          pageData,  //Loop Parameter
          httpRequest //Request Parameter
        );
      }
      if (httpRequest.readyState !== XMLHttpRequest.DONE) {
        return;
      }
      if (httpRequest.status === 200) { //Code for "Good"
        normalResponseHandler(
          pageData, URLOfPageToVisit,          //Loop Parameters
          httpRequest.responseXML, httpRequest //Request Parameters
        );
      } else {
        errorHandler(
          pageData, URLOfPageToVisit, //Loop Parameters
          httpRequest                 //Request Parameter
        );
      }
      onComplete(httpRequest);
    };
    httpRequest.open("GET", URLOfPageToVisit);
    httpRequest.responseType = "document";

    httpRequest.send();
    httpRequest.sent = true;

    requestCounter.increment();
  } //Close for loop iterating over links
  /* Even if no local links were every found and requested, still update the
   * request counter, so that presentResults() will be called regardless: */
  requestCounter.update();
} //Close function visitLinks

/*****
 *** PRESENTING RESULTS:
 *****/

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

  /* If no break-string is given, cutOffPoint right on the character: */
  if (breakStr === undefined) return str.substring(0, cutOffPoint);

  cutOffPoint = str.lastIndexOf(breakStr, cutOffPoint);

  /* If the breakStr character can't be found, return an empty string: */
  if (cutOffPoint === -1) return "";
  return str.substring(0, cutOffPoint);
}

/* Returns the ancestor of descendent (or descendent itself) which has a
 * given parent element, or null if parent is not an ancestor of descendent */
function getAncestorWithParent(descendent, parent) {
  let ancestor = descendent;
  let ancParent = ancestor.parentElement;
  while (ancParent !== parent) {
    if (ancParent === null) return null;
    ancestor = ancParent;
    ancParent = ancestor.parentElement;
  }
  return ancestor;
}

/* If the first parameter is null, return the second. Else, return the first: */
function nullDefault(possiblyNullVal, defaultValue) {
  const maybeLazy = (possiblyNullVal === null) ? defaultValue : possiblyNullVal;
  return (typeof maybeLazy === 'function') ? maybeLazy() : maybeLazy;
}

/**
 * Creates an auto-complete/suggestion-list element for a given input element
 * using a given array of suggestions.
 */
function makeAutoCompleteList(
  inputEle,
  suggestions,
  sugToEleMap = 'li',
  listEle = 'ul'
) {
  if (!(inputEle instanceof HTMLInputElement)) {
    throw new TypeError("inputEle must be an HTMLInputElement.");
  }
  const getSugEle = (sugStr, extraMetadata = {})=>{
    const defaultMetadata = Object.freeze({
      defaultContents() {
        if (this.showingAll) {
          return sugStr;
        }
        return this.tokens.map(
          tok => tok.match ? makeElement('strong', tok.str) : tok.str
        );
      },
    });
    const metadata = Object.assign({}, defaultMetadata, extraMetadata);
    if (typeof sugToEleMap === 'string') {
      /* By default, just return a <li> showing the suggestion with any matching
       * characters bolded: */
      return makeElement(sugToEleMap, metadata.defaultContents(), {
        tabIndex: '0', //Allow tab navigation to this element in normal order
        'data-value': sugStr
      });
    }
    if (sugToEleMap instanceof Map) {
      return sugToEleMap.get(sugStr);
    }
    if (typeof sugToEleMap === 'function') {
      return sugToEleMap(sugStr, metadata);
    }
    if (typeof sugToEleMap === 'object' && sugToEleMap !== null) {
      return sugToEleMap[sugStr];
    }
    throw new TypeError("sugToEleMap must be a Map, function, object, or string.");
  };
  const allSuggestionEles = ()=> {
    return suggestions.map(sug => getSugEle(sug, {showingAll: true}));
  };

  /* The outer container element for the list of suggestions: */
  const sugList = (()=>{
    if (typeof listEle === 'string') {
      return makeElement(listEle, undefined, {class: 'hidden'});
    }
    if (!(listEle instanceof HTMLElement)) {
      throw new TypeError("listEle must be undefined, a string or an HTMLElement!");
    }
    return listEle;
  })();
  appendChildren(sugList, allSuggestionEles());
  if (inputEle.id) {
    sugList.setAttribute('data-for', inputEle.id);
  }

  /* Shorthand function for hiding the suggestion list: */
  const hideSugList = (detail, after)=>{
    window.requestAnimationFrame(()=>{
      sugList.classList.add('hidden');
      if (after) after();
      sugList.dispatchEvent(new CustomEvent('hide', {detail}));
    });
  };
  const hideSugListFocusInput = (detail, after)=>{
    window.requestAnimationFrame(()=>{
      inputEle.focus();
      sugList.classList.add('hidden');
      if (after) after();
      sugList.dispatchEvent(new CustomEvent('hide', {detail}));
    });
  };
  const showSugList = (detail, after)=>{
    window.requestAnimationFrame(()=>{
      sugList.classList.remove('hidden');
      if (after) after();
      sugList.dispatchEvent(new CustomEvent('show', {detail}));
    });
  };

  /* Callback for updating the suggestion list: */
  function updateSuggestions() {
    clearChildren(sugList);
    const userPattern = inputEle.value;

    const [matchingSugEles, results] = (()=> {
      if (userPattern.length === 0) {
        return [allSuggestionEles(), suggestions];
      }
      /* Show a list of matching suggestions, with matching characters bolded: */
      const fuzzySearchResults = (suggestions
        .map(sug => fuzzySearchLex(userPattern, sug))
        .filter(fuzzyRes => !fuzzyRes.hasOwnProperty('error'))
      );
      /* If there are no matches, show a list of all suggestions: */
      if (fuzzySearchResults.length === 0) {
        return [allSuggestionEles(), suggestions];
      }
      /* If there are matches, sort them so the closest matches are on top: */
      return [(fuzzySearchResults
        .sort((res1, res2) => res1.insertions - res2.insertions)
        .map(fuzzyRes => getSugEle(fuzzyRes.refStr, fuzzyRes))
      ), fuzzySearchResults.map(res => res.refStr)];
    })();
    appendChildren(sugList, matchingSugEles);
    showSugList({
      reason: 'update',
      results
    });
  }

  /* Events for navigating and selecting items off of the suggestion list: */
  sugList.addEventListener("click", (e)=> {
    /* If the user clicked on the list but not a selection (e.g. by clicking the
     * border of the list element), do nothing: */
    if (e.target === sugList) return;

    const targetSuggestion = getAncestorWithParent(e.target, sugList);
    const eleValue = nullDefault(
      targetSuggestion.getAttribute('data-value'),
      ()=>targetSuggestion.innerText
    );

    /* If the element has no set data-value attribute (e.g. a custom element was
     * given via the sugToEleMap parameter), use the element's innerText: */
    inputEle.value = eleValue;
    hideSugListFocusInput({
      reason: 'click',
      selectionMade: true,
      selectionText: eleValue,
      selectionElement: targetSuggestion,
      sourceEvent: e
    }, ()=>{ inputEle.value = eleValue; }); //After closing, set input value
  });
  /* Follow the cursor with the focused suggestion: */
  sugList.addEventListener('mousemove', (e)=>{
    /* If the pointed-to element is already focused, do nothing: */
    if (
      e.target === sugList
      || e.target === document.activeElement
      || getAncestorWithParent(e.target, document.activeElement) !== null
    ) return;
    const targetSuggestion = getAncestorWithParent(e.target, sugList);
    window.requestAnimationFrame(()=>targetSuggestion.focus());
  });
  sugList.addEventListener("keydown", (e)=>{
    const targetSuggestion = getAncestorWithParent(e.target, sugList);
    if (e.key === "Enter")  {
      const eleValue = nullDefault(
        targetSuggestion.getAttribute('data-value'),
        ()=>targetSuggestion.innerText
      );
      hideSugListFocusInput({
        reason: 'enter-in-list',
        selectionMade: true,
        selectionText: eleValue,
        selectionElement: targetSuggestion,
        sourceEvent: e
      }, ()=>{ inputEle.value = eleValue; }); //After closing, set input value
    } else if (e.key === "ArrowUp") {
      const prevSug = targetSuggestion.previousSibling;
      if (prevSug === null) {
        hideSugListFocusInput({
          reason: 'close-up',
          selectionMade: false,
          sourceEvent: e
        });
      } else {
        window.requestAnimationFrame(()=>prevSug.focus());
      }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      const nextSug = targetSuggestion.nextSibling;
      if (nextSug !== null) {
        window.requestAnimationFrame(()=>nextSug.focus());
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      hideSugListFocusInput({
        reason: 'close-escape',
        selectionMade: false,
        sourceEvent: e
      });
    }
  });
  /* Events for populating the suggestion list and navigating to and from it via
   * the input element: */
  inputEle.addEventListener('input', updateSuggestions);
  inputEle.addEventListener('mousedown', (e)=>{
    /* If the input is clicked while already focused, show the list: */
    if (
      inputEle === document.activeElement
      && sugList.classList.contains('hidden')
    ) {
      showSugList({
        reason: 'open-click',
        sourceEvent: e
      });
    }
  });
  inputEle.addEventListener('keydown', (e)=>{
    if (sugList.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') {
        showSugList({
          reason: 'open-down',
          sourceEvent: e
        }, ()=>{
          console.time('menu-open-down');
          sugList.firstChild.focus();
          console.timeEnd('menu-open-down');
        }); //After opening, focus first child
        e.preventDefault();
      }
    } else {
      if (sugList.firstChild === null) return;
      switch (e.key) {
        case 'Enter': {
          const targetSuggestion = sugList.firstChild;
          const eleValue = nullDefault(
            targetSuggestion.getAttribute('data-value'),
            ()=>targetSuggestion.innerText
          );
          hideSugListFocusInput({
            reason: 'enter-in-input',
            selectionMade: true,
            selectionText: eleValue,
            selectionElement: targetSuggestion,
            sourceEvent: e
          }, ()=>{ inputEle.value = eleValue; }); //After closing, set input value
          break;
        }
        case 'ArrowDown':
          window.requestAnimationFrame(()=>sugList.firstChild.focus());
          e.preventDefault();
          break;
        case 'Backspace':
          if (inputEle.value.length === 0) {
            hideSugListFocusInput({
              reason: 'close-backspace',
              selectionMade: false,
              sourceEvent: e
            });
          }
          break;
        case 'Escape':
          hideSugListFocusInput({
            reason: 'close-escape-in-input',
            selectionMade: false,
            sourceEvent: e
          });
          break;
        default:
          return;
      }
    }
  });
  /* Allow for the dropdown to be closed by clicking off of it: */
  document.addEventListener('mousedown', (e)=>{
    const selection = getAncestorWithParent(e.target, sugList);
    if (selection === null && e.target !== inputEle) sugList.hide('click-off');
  });
  /* Add utility functions for programmatically manipulating the list: */
  Object.assign(sugList, {
    show(reason = 'function-call') {
      showSugList({reason});
    },
    hide(reason = 'function-call') {
      hideSugList({
        reason,
        selectionMade: false,
      });
    },
    update: updateSuggestions
  });
  return sugList;
}

/* Checks if the given pattern matches the given reference string. Returns an
 * array of token objects which correspond the the substrings of the reference
 * which match and do not match the pattern (determined by their .match
 * property).
 *
 * This is used by the makeAutoCompleteList function to produce a
 * suggestion list where the matching characters are bolded. */
function fuzzySearchLex(ptrn, refStr, extraOpts = {}) {
  const defaultOptions = {caseSensitive: false};
  const opts = Object.assign({}, defaultOptions, extraOpts);

  /* Case-(in)sensitive string comparison: */
  const strComp = (()=>{
    const sensitivity = (opts.caseSensitive) ? "case" : "base";
    const compOpts = {usage: 'search', sensitivity};
    return (s1, s2) => s1.localeCompare(s2, undefined, compOpts);
  })();

  const ptrnLen = ptrn.length;
  const refLen = refStr.length;

  const makeErrorObj = (errorMessage, errorCode)=>{
    return {error: true, errorMessage, errorCode};
  };
  if (ptrnLen === 0) {
    return makeErrorObj("Empty Pattern", -1);
  }
  if (ptrnLen > refLen) {
    return makeErrorObj("Pattern is longer than reference string.", -2);
  }
  const tokens = [];
  let currentTokenStartIndex = 0;
  let currentTokenIsMatch = (0 === strComp(ptrn.charAt(0), refStr.charAt(0)));
  let refIndex = 1;
  let ptrnIndex = (currentTokenIsMatch) ? 1 : 0;
  let insertions = (currentTokenIsMatch) ? 0 : 1;
  const breakToken = ()=>{
    tokens.push({
      str: refStr.substring(currentTokenStartIndex, refIndex),
      match: currentTokenIsMatch
    });
    currentTokenStartIndex = refIndex;
    currentTokenIsMatch = !currentTokenIsMatch;
  };
  while (ptrnIndex < ptrnLen) {
    if (strComp(ptrn.charAt(ptrnIndex), refStr.charAt(refIndex)) === 0) {
      ++ptrnIndex;
      if (!currentTokenIsMatch) breakToken();
    } else {
      if (refIndex >= refLen) {
        return makeErrorObj("Pattern doesn't match reference string.", -3);
      }
      insertions += 1;
      if (currentTokenIsMatch) breakToken();
    }
    ++refIndex;
  }
  breakToken();
  if (refIndex !== refLen) {
    insertions += refLen - refIndex;
    refIndex = refLen;
    breakToken();
  }
  return {pattern: ptrn, refStr, tokens, insertions};
}

/* This is called when the crawling is fully complete. it is the last
 * part of the script ot be executed: */
function presentResults() {
  /* Create a document fragment to contain all of our DOM manipulation on the
   * modal while in-progress. This avoids constantly repainting the document
   * while changes are still being made: */
  const ModalBuffer = document.createDocumentFragment();

  /* Create button for minimizing modal so that the site can be used normally:
   * (The text is a minimize symbol, resembling "_")*/
  const minimizeButton = makeElement("button", "🗕", {id: "crlr-min"});
  minimizeButton.type = "button";
  minimizeButton.onclick = () => MODAL.classList.toggle("minimized");

  /* Make the modal header, containing the minimize button, the title, etc.: */
  let headerStr = "Results";
  headerStr += (crawlTerminatedBeforeCompletion) ? " (incomplete):" : ":";
  const modalTitle = makeElement("h1", headerStr, {id: "crlr-title"});
  const modalHeaderMsg = makeElement("div", modalTitle,
    {
      id: "crlr-header-msg",
      class: "flex-row"
    }
  );
  const modalHeader = makeElement("header", [minimizeButton, modalHeaderMsg],
    {
      id: "crlr-header",
      class: "flex-row"
    }
  );
  ModalBuffer.appendChild(modalHeader);

  /* Make the modal content, for presenting crawl data and controls for viewing
   * that data: */
  const modalContent = makeElement("div", undefined, {id: "crlr-content"});
  ModalBuffer.appendChild(modalContent);

  /* Make textbox and suggestion-list for specifying which label to show data
   * for in the modal: */
  const inputTextBox = makeElement("input", undefined, {
    id: "crlr-input-textbox",
    type: "text",
    value: "link",
    spellcheck: "false"
  });

  const [suggestions, emptySugs] = (()=>{
    const keys = [];
    const emptySet = new Set();
    /* Iterate over Group labels, then iterate over Element labels:
     * (The order doesn't actually matter.) */
    let labelTable = RecordGroup.LabelTable;
    const checkLabel = (label)=>{
      keys.push(label);
      if (labelTable[label] === undefined) emptySet.add(label);
    };
    for (const label of GROUP_LABELS.list) checkLabel(label);
    labelTable = ElementRecord.LabelTable;
    for (const label of ELEMENT_LABELS.list) checkLabel(label);
    return [keys, emptySet];
  })();

  const rowElementFromLabel = (sugStr, metadata)=>{
    const sugColumn = makeElement('td', metadata.defaultContents(), {
      class: 'crlr-suggestion'
    });
    const isEmpty = emptySugs.has(sugStr);
    const emptyColumn = makeElement('td', isEmpty ? "(empty)" : "", {
      class: 'crlr-suggestion-info'
    });
    const row = makeElement('tr', [sugColumn, emptyColumn], {
      tabIndex: '0', //Allow tab navigation to this element in normal order
      'data-value': sugStr
    });
    row.classList.add('crlr-suggestion-row');
    if (isEmpty) row.classList.add('empty-suggestion');
    return row;
  };
  const sugList = makeAutoCompleteList(
    inputTextBox,
    suggestions,
    rowElementFromLabel, //Function mapping a suggestion to an element
    'table' //The tagname of the outer, container element
  );
  sugList.id = 'crlr-suggestions';

  /* A container for the textbox and suggestion list, for styling purposes: */
  const sugContainer = makeElement('div', [inputTextBox, sugList], {
    id: 'crlr-textbox-suggestions-container' //oof
  });

  const clearInputButton = makeElement(
    "button",
    "✕", //"x" cross symbol
    {
      id: "crlr-input-clear",
      "data-for": "crlr-input-textbox"
    }
  );
  clearInputButton.addEventListener(
    'click',
    function clearInput() {
      inputTextBox.value = "";
      sugList.update();
      inputTextBox.focus();
    }
  );
  const logObjInputContainer = makeElement(
    "div",
    [clearInputButton, sugContainer],
    {id: "crlr-textbox-controls"}
  );

  const altFormatCheckBox = makeElement(
    "input",
    undefined,
    {
      id: "crlr-data-alt-format-checkbox",
      type: "checkbox",
    }
  );
  const checkBoxLabel = makeElement(
    "label",
    "Invert output mapping?",
    {
      for: "crlr-data-alt-format-checkbox"
    }
  );
  const inputRow = makeElement(
    "div",
    [logObjInputContainer, altFormatCheckBox, checkBoxLabel],
    {
      id: "crlr-inputs",
      class: "flex-row"
    }
  );

  /* Use as a mouse-down event on any element to prevent higlighting via
   * double- or triple-clicking. */
  function preventClickToHighlight(event) {
    if (event.detail > 1) {
      event.preventDefault();
    }
  }
  altFormatCheckBox.onmousedown = preventClickToHighlight;
  checkBoxLabel    .onmousedown = preventClickToHighlight;

  /* Create containers for output: */
  const pre = makeElement("pre");
  const preCont = makeElement("div", pre, {class: "crlr-output"});
  const dlLinkPara = makeElement("p");
  appendChildren(
    modalContent,
    [inputRow, preCont, dlLinkPara]
  );

  /* Returns an object which maps a page's href to an array of hrefs/srcs of
   * elements on that page which match the given label. If the invertMapping
   * parameter is truthy, that mapping is inverted, so that an element's href/
   * src maps to an array of documents containing that element: */
  const collectDataForLabel = (label, invertMapping)=>{
    const labelType = (GROUP_LABELS.has(label)) ? GROUP_LABELS : ELEMENT_LABELS;
    const recordList = getAllRecordsLabelled(label);
    const labelData = Object.create(null);
    if (recordList !== null) {
      for (const record of recordList) {
        let key, val;

        /* Map from from a given element to URLs of pages which contain a
         * matching element. E.g. URL => list of pages containing links to that
         * URL: */
        if (invertMapping) {
          /* Use the appropriate name for displaying the list of locations of
           * each element (i.e. pages containing that element): */
          key = labelType.metadata[label].getLocationsName(record.element);
          val = record.document;
        }
        /* Map from page URL to elements on that page
         * (i.e. page -> [elements]): */
        else {
          key = record.document;

          /* Use the appropriate name for displaying the list of instances of
           * elements matching the given element on each page. */
          val = labelType.metadata[label].getInstancesName(record.element);
        }
        maybeArrayPush(labelData, key, val);
      }
    }
    return labelData;
  };

  /* For handling the output of logging objects to the user: */
  const updateOutput = (function() {
    let usingAltFormat;

    function outputDataToModal(label) {
      const MAX_OUTPUT_LENGTH = 5000;

      /* Main JSON Preview output: */
      const objForLabel = collectDataForLabel(label, usingAltFormat);
      const objJSON = JSON.stringify(objForLabel, null, 2);
      const previewTooLong = (objJSON.length > MAX_OUTPUT_LENGTH);
      let objJSONPreview = objJSON;
      if (previewTooLong) {
        objJSONPreview = cutOff(objJSON, MAX_OUTPUT_LENGTH, "\n");
        objJSONPreview += "\n...";
      }

      /* Prepare data for the download link and the text around it: */
      let beforeLinkText = "";
      let linkText;
      let afterLinkText = "";
      if (previewTooLong) {
        beforeLinkText =  "Note that the data shown above is only a preview, ";
        beforeLinkText += "as the full data was too long. ";
        linkText = "Click here";
        afterLinkText = " to download the full JSON file.";
      }
      else {
        linkText = "Download JSON";
      }

      const blob = new Blob([objJSON], {type: 'application/json'});
      const url = URL.createObjectURL(blob);

      let downloadName = window.location.hostname.replace(/^www\./i, "");
      downloadName += "_" + label;
      if (crawlTerminatedBeforeCompletion) downloadName += "_(INCOMPLETE)";
      downloadName +=".json";

      const dlLink = makeElement(
        "a",
        linkText,
        {
          href: url,
          download: downloadName,
          class: "crlr-download"
        }
      );
      window.requestAnimationFrame(()=>{
        pre.innerText = objJSONPreview;
        clearChildren(dlLinkPara);
        appendChildren(dlLinkPara, [beforeLinkText, dlLink, afterLinkText]);
      });
    }
    /* Reads which log object to output, what format to use, and calls
     * outputLogObjToModal to actually change what is shown to the user: */
    return function updateOutput() {
      const wantedLabel = inputTextBox.value;

      /* If the user has not inputted a valid label, don't change the currently
       * displayed data (they may be in the middle of typing): */
      if (!ELEMENT_LABELS.has(wantedLabel) && !GROUP_LABELS.has(wantedLabel)) {
        return;
      }
      usingAltFormat = altFormatCheckBox.checked;
      outputDataToModal(wantedLabel);
    };
  }());//Close closure

  /* Call the function immediately so that the data for the default label
   * is displayed immediately: */
  updateOutput();
  inputTextBox.addEventListener("input", updateOutput);
  sugList.addEventListener('hide', (e)=>{
    if (e.detail.selectionMade) updateOutput();
  });
  altFormatCheckBox.addEventListener("change", updateOutput);

  /* Add how long the crawler took to the header: */
  const endTime = performance.now();
  const runningTime = Math.round((endTime - startTime)/10)/100;
  const timeInfoEle = makeElement(
    "p",
    `(Crawling took ${runningTime} seconds)`,
    {id: "crlr-time"}
  );
  modalHeaderMsg.appendChild(timeInfoEle);

  /* Remove the counter now that requests are finished */
  requestCounter.remove();

  /* Paint the completed buffer to the document/screen: */
  MODAL.appendChild(ModalBuffer);
}

/**
 * Robots.txt-related functions:
 */
function RobotsTxt() {
  this.rawText = undefined;
  this.fileRead = false;
  this.ignoreFile = false;
  this.patterns = {
    allow: [],
    disallow: [],
    sitemap: []
  };

  /* Methods: */
  /* @Static */
  this.parseText = function (rawText) {
    const disallowed = [];
    const allowed = [];
    const sitemap = [];

    const lines = rawText.split(/[\n\r]/);

    /* Do allow and disallow statements in this block apply to us? I.e. are they
     * preceded by a user-agent statement which matches us? */
    let validUserAgentSection = true;
    for (let i = 0, len = lines.length; i < len; ++i) {
      const line = lines[i].trim();

      /* Skip empty and comment lines: */
      if (line.length === 0 || line.charAt(0) === "#") continue;

      /* Split the line by the first colon ":": */
      const parsedLine = (function() {
        const splitPoint = line.indexOf(":");
        if (splitPoint === -1) {
          return undefined;
        }
        const firstHalf = line.substring(0, splitPoint);
        const secondHalf = line.substring(splitPoint + 1);
        return [firstHalf, secondHalf];
      }());
      if (parsedLine === undefined) {
        console.warn(`Don't understand: "${line}"`);
      }
      const clauseType = parsedLine[0].trim().toLowerCase();
      const clauseValue = parsedLine[1].trim();

      /* Check for sitemaps before checking the user agent so that they are always
       * visible to us: */
      if (clauseType === "sitemap") {
        sitemap.push(clauseValue);
      }
      /* Make sure the user agent matches this crawler: */
      else if (clauseType === "user-agent") {
        validUserAgentSection = (clauseValue === "*");
      }
      /* Skip the remaining section until a matching user-agent directive is
       * found: */
      else if (!validUserAgentSection) {
        continue;
      }
      /* If the line is a disallow clause, add the pattern to the array of
       * disallowed patterns: */
      else if (clauseType === "disallow") {
        /* An empty disallow string is considered equal to a global allow. */
        if (clauseValue === "") {
          allowed.push("/");
        } else {
          disallowed.push(clauseValue);
        }
      }
      /* If the line is an allow clause, add the pattern to the array of
       * allowed patterns: */
      else if (clauseType === "allow") {
        allowed.push(clauseValue);
      } else {
        console.warn(`Unknown clause: "${line}"`);
      }
    }
    return {
      allow: allowed,
      disallow: disallowed,
      sitemap: sitemap
    };
  };

  /* @Static */
  this.matchesPattern = function (str, basePattern) {
    let parsedPattern = basePattern;
    /* If a pattern ends in "$", the string must end with the pattern to match:
     *
     * E.G. "/*.php$" will match "/files/documents/letter.php" but
     * won't match "/files/my.php.data/settings.txt". */
    const REQUIRE_END_WITH_PATTERN =
        (parsedPattern.charAt(parsedPattern.length-1) === "$");
    if (REQUIRE_END_WITH_PATTERN) {
      /* Remove the $ character from the pattern: */
      parsedPattern = parsedPattern.substr(0, parsedPattern.length-1);
    }

    /* Removing trailing asterisks, which are extraneous: */
    for (let i = parsedPattern.length-1; /*@noConditional*/; --i) {
      /* If the entire pattern is asterisks, then anything will match: */
      if (i <= 0) return true;

      if (parsedPattern.charAt(i) !== "*") {
        parsedPattern = parsedPattern.substr(0, i+1);
        break;
      }
    }

    const patternSections = parsedPattern.split("*");
    let patternIndex = 0;
    for (let strIndex = 0, len = str.length; strIndex < len; /*@noIncrement*/) {
      const subPat = patternSections[patternIndex];

      /*Skip empty patterns: */
      if (subPat === "") {
        ++patternIndex;
        continue;
      }
      if (subPat === str.substr(strIndex, subPat.length)) {
        ++patternIndex;
        strIndex += subPat.length;

        /* If we've reached the end of the pattern: */
        if (patternIndex === patternSections.length) {
          if (REQUIRE_END_WITH_PATTERN) {
            return (strIndex === len);
          }
          /* Otherwise, the pattern is definitely a match: */
          return true;
        }
      }
      /* If this sub-pattern didn't match at this point, move 1 character over: */
      else {
        ++strIndex;
      }
    }
    /* If we reached the end of the string without finishing the pattern, it's
     * not a match: */
    return false;
  };
  this.isUrlAllowed = function (fullUrl) {
    if (HOSTNAME !== (new URL(fullUrl)).hostname.toLowerCase()) {
      throw new Error("URL " + fullUrl + " is not within the same domain!");
    }
    if (this.ignoreFile) return true;

    /* The path portion of the fullURL. That is, the part
     * following the ".com" or ".net" or ".edu" or whatever.
     *
     * For example, on a site's homepage, the path is "/", and
     * on an faq page, it might be "/faq.html" */
    const pagePath = fullUrl.substr(DOMAIN.length); //@Refactor use location api?

    /* Allow statements supersede disallow statements, so we can
     * check the allowed list first and shortcut to true if we
     * find a match: */
    for (let i = 0, len = this.patterns.allow.length; i < len; ++i) {
      const pattern = this.patterns.allow[i];
      if (this.matchesPattern(pagePath, pattern)) return true;
    }
    for (let i = 0, len = this.patterns.disallow.length; i < len; ++i) {
      const pattern = this.patterns.disallow[i];
      if (this.matchesPattern(pagePath, pattern)) return false;
    }
    /* If this page is on neither the allowed nor disallowed
     * list, then we can assume it's allowed: */
    return true;
  };

  this.requestAndParse = function (onComplete) {
    if (this.ignoreFile) {
      /* Ensure asynchronous execution: */
      window.setTimeout(onComplete(null));
      return;
    }

    const httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = () => {
      if (httpRequest.readyState === XMLHttpRequest.DONE) {
        if (httpRequest.status === 200) { //Code for "Good"
          this.rawText = httpRequest.responseText;
          this.patterns = this.parseText(this.rawText);
        } else {
          this.rawText = null;
        }
        this.fileRead = true;
        onComplete(this);
      }
    };
    httpRequest.open("GET", "/robots.txt");
    httpRequest.send();
  };
}

const robotsTxtHandler = new RobotsTxt();

function startCrawl(flagStr, robotsTxt=robotsTxtHandler) {
  /* Handle flags: */
  /* Ignore robots.txt directives */
  if (/-ignoreRobots\.?Txt\b/i.test(flagStr)) {
    robotsTxt.ignoreFile = true;
  }
  /* Ignore the banned string list? */
  if (/-ignoreBannedStr(?:ing)?s?\b/i.test(flagStr)) {
    BANNED_STRINGS.forceBanned = false;
  }
  /* Ignore the script timeout timer? If this flag is set, the crawl will run
   * indefinitely, until either no unvisited links are found or the browser runs
   * out of memory. */
  if (/-ignore(?:Timeout|Timer)\b/i.test(flagStr)) {
    window.clearTimeout(TIMEOUT_TIMER);
  }
  /* Crawl only the current page? Note that requests will still be made for
   * internal pages linked-to from the starter page, for the sake of detecting
   * network/request errors, but those pages will not be checked themselves. */
  let recursiveCrawl = true;
  if (/-(?:single|one|1)(?:Page|Pg)\b/i.test(flagStr)) {
    recursiveCrawl = false;
  }
  /* Add disallow rules to the robots.txt handler. This is useful for excluding
   * large/infinite URL spaces (e.g. maps, extremely long paginated lists).
   *
   * NOTE: This flag is handled in the requestAndParse callback, because
   * the requestAndParse function completely overwrites the patterns property. */
  const disallowMatch = /-disallow(["'`])([^"\n]+)\1/i.exec(flagStr);
  let userDisallowed;
  if (disallowMatch === null) {
    userDisallowed = [];
  } else {
    userDisallowed = disallowMatch[2].split(/\s*[,]\s*/);
  }

  /* Specify a CSS selector which will group any matching elements into the
   * "user-selected" label. Useful for finding particular elements not otherwise
   * captured by the script: */
  const userSelectorMatch = (
    /-(?:CSS)?[-_]?Select(?:[oe]r)?(["'`])([^"\n]+)\1/i.exec(flagStr)
  );
  if (userSelectorMatch !== null) {
    const selector = userSelectorMatch[2];
    USER_SELECTOR.selector = selector;
    /* To prevent silent failure, try a match right away to see if the selector
     * is valid: */
    try {
      document.querySelector(selector);
    } catch (e) {
      if (e.name === 'SyntaxError') {
        throw new Error(`"${selector}" is not a valid CSS selector!`);
      } else {
        throw e;
      }
    }
  }

  /* Setup robotsTxt handler and start the crawl: */
  robotsTxt.requestAndParse(function afterRobotsTxtParse() {
    /* Handle disallowMatchFlag AFTER parsing, because parsing overwrites the
     * patterns property: */
    robotsTxt.patterns.disallow.push(...userDisallowed);
    Object.freeze(robotsTxt);

    const anchorlessURL = urlRemoveAnchor(window.location);
    classifyImages(document, anchorlessURL);
    classifyOther(document, anchorlessURL);
    const initialPageLinks = classifyLinks(document, anchorlessURL);

    /* A spoof link to mark the page where the crawl started as visited, so that
     * it will not be crawled a second time: */
    const initLabel = "(Initial page for crawler script)";
    const startPageSpoofLink = makeElement(
      "a",
      initLabel,
      {href: anchorlessURL}
    );
    const spoofLinkRecord = new ElementRecord(anchorlessURL, startPageSpoofLink);
    spoofLinkRecord.group.label("visited");
    spoofLinkRecord.label("startPage");

    visitLinks(initialPageLinks, anchorlessURL, robotsTxt, recursiveCrawl);
  });
}

startCrawl("-select'h2'");
