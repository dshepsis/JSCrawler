/* @issue Rarely, the CSS will totally fail to apply to the crlr modal. I don't
 * know exactly why this happens, but creating a new, identical style element
 * and appending it seems to fix the issue. It might be a timing thing.
 * Specifically this happens on kh.com */

'use strict';
const startTime = performance.now();

/* A helper function which throws a pre-baked error message when the parameter
 * ambiguousVar does not match the type specified by desiredType: */
function validateType(ambiguousVar, desiredType, nameStr = "variable") {
  /* Validate the type of nameStr: */
  if (typeof nameStr !== 'string') {
    throw new TypeError(`nameStr must be a string. Instead, its type was \
'${typeof nameStr}'.`);
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
    validationStyle === 'function'
    && desiredType.prototype !== undefined
  ) {
    desiredTypeStr = desiredType.name;
    isCorrectType = (ambiguousVar instanceof desiredType);
  } else {
    /* Throw a TypeError because desiredType has an invalid type: */
    throw new TypeError(`desiredType must be a string (matching the typeof to \
validate against) or a constructor function (matching the instanceof to \
validate against). Instead, its type was: ${validationStyle}.`);
  }

  if (isCorrectType) {
    return ambiguousVar;
  } else {
    let wrongType = typeof ambiguousVar;

    /* Special case for null, which has type 'object' for legacy reasons: */
    if (ambiguousVar === null) wrongType = "null pointer";
    else if (wrongType === 'object') wrongType = ambiguousVar.constructor.name;

    /* Actually throw the meaningful error: */
    throw new TypeError(`${nameStr} must be of type "${desiredTypeStr}"! \
Instead, it was of type ${wrongType}.`);
  }
}

/* Warn the user about navigating away during crawl: */
window.addEventListener("beforeunload", function (e) {
  /* Note: In modern browsers, these messages are ignored as a security feature,
   * and a default message is displayed instead. */
  const confirmationMessage = "Warning: Navigating away from the page during a \
site-crawl will cancel the crawl, losing all progress. Are you sure you want \
to continue?";
  e.returnValue = confirmationMessage;     // Gecko, Trident, Chrome 34+
  return confirmationMessage;              // Gecko, WebKit, Chrome <34
});

const DOMAIN = window.location.origin;
const HOSTNAME = window.location.hostname.toLowerCase();
const PROTOCOL = window.location.protocol;


/* Settings variables: */
const RECOGNIZED_FILE_TYPES = ["doc", "docx", "gif", "jpeg", "jpg", "pdf",
    "png", "ppt", "pptx", "xls", "xlsm", "xlsx"];
const RECOGNIZED_SCHEMES = ["mailto:", "tel:"];

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
}

const MAX_TIMEOUT = 60*1000; //Miliseconds
let timedOut = false;
const allRequests = [];

/* A function which aborts any live requests at the time of execution: */
const QUIT = (noisy)=>{
  timedOut = true;
  for (let r = 0, len = allRequests.length; r < len; ++r) {
    const request = allRequests[r];

    /* If the request has already completed, don't abort it */
    if (request.readyState === 4) continue;
    request.abortedDueToTimeout = true;
    request.abort();
    if (noisy) {
      console.warn("Aborting request at index " + r + " of allRequests");
    }
  }
}
/* Aliasing, so that a user can more easily stop a runaway crawl: */
const Quit = QUIT; const quit = QUIT;
const EXIT = QUIT; const Exit = QUIT; const exit = QUIT;

/* Set a timer to end all live requests when the timer is reached. */
const TIMEOUT_TIMER = window.setTimeout(()=>QUIT(true), MAX_TIMEOUT);

function urlRemoveAnchor(locationObj) {
  if (typeof locationObj === "string") {
    /* For some reason, creating a link with an empty string for an href makes
     * that link think it refers to the current page. In other words, an empty
     * href behaves like "/". So we have to manually avoid this behavior to
     * avoid associating a null link with a refresh link. */
    if (locationObj === "") return "";
    return urlRemoveAnchor(makeElement("a", undefined, {href: locationObj}));
  }
  return locationObj.origin + locationObj.pathname + locationObj.search;
}

/* Because Sets do not store their values directly as own-properties,
 * Object.freeze is not enough to make the Set immutable. We instead have to
 * manually override the mutator functions to throw errors: */
function freezeSet(mySet) {
  mySet.add = function() {
    throw new Error("Cannot add to read only Set.");
  }
  mySet.clear = function () {
    throw new Error("Cannot clear read only Set.");
  }
  mySet.delete = function () {
    throw new Error("Cannot delete from read only Set.");
  }
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
    writable : false,
    enumerable : true,
    configurable : false
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
    obj[prop] = newVal
    return newVal;
  } else {
    if (onExistence !== undefined) onExistence(existingVal);
    return existingVal;
  }
}

/* Add the value val to the array specified by obj[arrName]. If there is not a
 * array defined there already, an empty one is made and val is added to it: */
const maybeArrayPush = function (obj, arrName, val) {
  makeIfUndef(obj, arrName, ()=>[]).push(val);
}

/* Returns either an element's href property, or its src property, whichever is
 * isn't undefined. Throws an error if both or neither of them are defined.
 * Note hrefs are returned without an anchor (the part after the #, if present).*/
function getHrefOrSrcProp(ele, retainAnchor) {
  validateType(ele, HTMLElement, "element");
  if ((ele.href !== undefined) && (ele.src  !== undefined)) throw new Error("Element with href AND src!?!") //@debug
  if (ele.href !== undefined) {
    return (retainAnchor ? ele.href : urlRemoveAnchor(ele));
  }
  if (ele.src  !== undefined) {
    return ele.src;
  }
  throw new TypeError(`elementInDocument must have either an href or a \
source.`);
}
/* Similar to above, except returns the attribute instead of the property: */
function getHrefOrSrcAttr(ele) {
  validateType(ele, HTMLElement, "element");
  if ((ele.href !== undefined) && (ele.src  !== undefined)) throw new Error("Element with href AND src!?!") //@debug
  for (const attrName of ["href", "src"]) {
    const attrVal = ele.getAttribute(attrName);
    if (attrVal !== null) return attrVal
  }
  /* Null links may very well have a null href, so there's no reason to throw an
   * error. */
  return null;
}

/* Labels which apply to all elements in the same group. For example, links
 * are grouped by the page they point to. Two or more links may point to the
 * same page while having different HREFs (e.g. one absolute and one relative),
 * so if one of them 404s (notFound), all of the others will too. */
const GROUP_LABELS = freezeSet(new Set([
  "link",
  "internal",
  "external",
  "image",
  "null",
  "Email",
  "localFile",
  "http-httpsError",
  "unusualScheme",
  "visited",
  "unknownContentType",
  "redirects",
  "accessDenied",
  "forbidden",
  "notFound",
  "robotsDisallowed",
  "file"
]));

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
      if ( this.labels.has(this.constructor.validateLabel(label)) ) {
        continue;
      }
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
const ELEMENT_LABELS = freezeSet(new Set([
  "startPage",
  "bannedString",
  "absoluteInternal",
  "unloaded",
  "anchor"
]));

/* Associates a document, set of labels, and a group with a given HTML Element: */
class ElementRecord {
  constructor(documentID, elementInDocument, eleToGroupName) {
    /* Default function for converting an element into a string ID: */
    if (eleToGroupName === undefined) {
      eleToGroupName = getHrefOrSrcProp;
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
    const groupName = eleToGroupName(elementInDocument);
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
}

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
    appendChildren(newEle, content)
  }
  if (attrObj !== undefined) {
    for (const attribute in attrObj) {
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
const CRAWLER_CSS = `#crlr-modal,#crlr-modal *{all:initial;box-sizing:border-box}#crlr-modal p,#crlr-modal h1,#crlr-modal h2,#crlr-modal h3,#crlr-modal h4,#crlr-modal h5,#crlr-modal h6,#crlr-modal ol,#crlr-modal ul,#crlr-modal pre,#crlr-modal address,#crlr-modal blockquote,#crlr-modal dl,#crlr-modal div,#crlr-modal fieldset,#crlr-modal form,#crlr-modal hr,#crlr-modal noscript,#crlr-modal table{display:block}#crlr-modal h1{font-size:2em;font-weight:bold;margin-top:0.67em;margin-bottom:0.67em}#crlr-modal h2{font-size:1.5em;font-weight:bold;margin-top:0.83em;margin-bottom:0.83em}#crlr-modal h3{font-size:1.17em;font-weight:bold;margin-top:1em;margin-bottom:1em}#crlr-modal h4{font-weight:bold;margin-top:1.33em;margin-bottom:1.33em}#crlr-modal h5{font-size:.83em;font-weight:bold;margin-top:1.67em;margin-bottom:1.67em}#crlr-modal h6{font-size:.67em;font-weight:bold;margin-top:2.33em;margin-bottom:2.33em}#crlr-modal *{font-family:sans-serif}#crlr-modal pre,#crlr-modal pre *{font-family:monospace;white-space:pre}#crlr-modal a:link{color:#00e;text-decoration:underline}#crlr-modal a:visited{color:#551a8b}#crlr-modal a:hover{color:darkred}#crlr-modal a:active{color:red}#crlr-modal a:focus{outline:2px dotted #a6c7ff}#crlr-modal{border:5px solid #0000a3;border-radius:1em;background-color:#fcfcfe;position:fixed;z-index:99999999999999;top:2em;bottom:2em;left:2em;right:2em;margin:0;overflow:hidden;color:#222;box-shadow:2px 2px 6px 1px rgba(0, 0, 0, 0.4);display:flex;flex-direction:column}#crlr-modal.waiting-for-results{bottom:auto;right:auto;display:table;padding:1em}#crlr-modal #crlr-min{border:1px solid gray;padding:0.5em;border-radius:5px;background-color:rgba(0,0,20,0.1)}#crlr-modal #crlr-min:hover{border-color:blue;background-color:rgba(0,0,20,0.2)}#crlr-modal #crlr-min:focus{box-shadow:0 0 0 1px #a6c7ff;border-color:#a6c7ff}#crlr-modal .flex-row{display:flex}#crlr-modal .flex-row > *{margin-top:0;margin-bottom:0;margin-right:16px}#crlr-modal .flex-row > *:last-child{margin-right:0}#crlr-modal #crlr-header{align-items:flex-end;padding:0.5em;border-bottom:1px dotted #808080;width:100%;background-color:#e1e1ea}#crlr-modal #crlr-header #crlr-header-msg{align-items:baseline}#crlr-modal #crlr-content{flex:1;padding:1em;overflow-y:auto;overflow-x:hidden}#crlr-modal #crlr-content > *{margin-bottom:10px}#crlr-modal #crlr-content > :last-child{margin-bottom:0}#crlr-modal.minimized *:not(#crlr-min){display:none}#crlr-modal.minimized #crlr-header{display:flex;margin:0;border:none}#crlr-modal.minimized{display:table;background-color:#e1e1ea;opacity:0.2;transition:opacity .2s}#crlr-modal.minimized:hover,#crlr-modal.minimized:focus-within{opacity:1}#crlr-modal.minimized #crlr-min{margin:0}#crlr-modal #crlr-inputs *{font-size:1.25em}#crlr-modal #crlr-input-clear{background-color:#ededf2;margin-right:0.25em;padding:0px 0.25em;border:none;font-size:1em}#crlr-modal #crlr-input-clear:active{box-shadow:inset 1px 1px 2px 1px rgba(0,0,0,0.25)}#crlr-modal #crlr-input-clear:focus{outline:2px solid #a6c7ff}#crlr-modal #crlr-textbox-controls{border:2px solid transparent;border-bottom:2px solid #b0b0b0;background-color:#ededf2;transition:border 0.2s}#crlr-modal #crlr-textbox-controls.focus-within,#crlr-modal #crlr-textbox-controls:focus-within{border:2px solid #a6c7ff}#crlr-input-textbox{background-color:transparent;border:none}#crlr-modal #crlr-autocomplete-list{display:none}#crlr-modal input[type="checkbox"]{opacity:0;margin:0}#crlr-modal input[type="checkbox"] + label{padding-top:0.1em;padding-bottom:0.1em;padding-left:1.75em;position:relative;align-self:center}#crlr-modal input[type="checkbox"] + label::before{position:absolute;left:.125em;height:1.4em;top:0;border:1px solid gray;padding:0 .2em;line-height:1.4em;background-color:#e1e1ea;content:"✔";color:transparent;display:block}#crlr-modal input[type="checkbox"]:checked + label::before{color:#222}#crlr-modal input[type="checkbox"]:focus + label::before{box-shadow:0 0 0 1px #a6c7ff;border-color:#a6c7ff}#crlr-modal input[type="checkbox"]:active + label::before{box-shadow:inset 1px 1px 2px 1px rgba(0,0,0,0.25)}#crlr-modal .crlr-output{display:inline-block;max-width:100%}#crlr-modal .crlr-output > pre{max-height:200px;padding:0.5em;overflow:auto;border:1px dashed gray;background-color:#e1e1ea}#crlr-modal.browser-gecko .crlr-output > pre{overflow-y:scroll}`;
const styleEle = makeElement("style", CRAWLER_CSS, {title:"crlr.js.css"});
document.head.appendChild(styleEle);

/* Make modal element: */
const MODAL = makeElement("div", undefined, {id: "crlr-modal"});
document.body.insertBefore(MODAL, document.body.childNodes[0]);

/* Prevent click events on the modal triggering events on the rest of the page: */
MODAL.addEventListener(
  "click",
  function(e) {
    if (!e) e = window.event;
    e.cancelBubble = true;
    if (e.stopPropagation) e.stopPropagation();
  }
);
/* For browser-specific CSS and formatting: */
const isBrowserWebkit = /webkit/i.test(navigator.userAgent);
MODAL.classList.add(isBrowserWebkit ? "browser-webkit" : "browser-gecko");

/* Adds a counter to the modal, showing the number of live (unresolved) http
 * requests currently waiting: */
const requestCounter = (function() {
  /* Create display: */
  const disp = makeElement("p", undefined,
    {
      id: "request-counter",
      title: "Number of page requests currently loading"
    }
  );
  const waitingClassString = "waiting-for-results";
  /* Methods to allow other code to affect the counter: */
  const API = {
    displayElement: disp,
    count: 0,
    update() {
      disp.innerHTML = `Requests: ${this.count}`;
    },
    increment() {
      ++this.count; this.update();
    },
    decrement() {
      --this.count; this.update();
    },
    setText(text) {
      disp.innerHTML = text;
    },
    remove() {
      MODAL.removeChild(disp);
      MODAL.classList.remove(waitingClassString);
    }
  }
  API.update();
  MODAL.classList.add(waitingClassString);
  MODAL.appendChild(disp);
  return API;
})();

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
    const anchorlessHref = urlRemoveAnchor(link);
    const linkRecord = new ElementRecord(curPageURL, link);
    linkRecord.group.label("link");

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
      console.error(`Found link ${hrefAttr} containing a banned string: \
${bannedStr}.\n\tLinked-to from: ${curPageURL}`);
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
      if (linkProtocol !== PROTOCOL) {
        linkRecord.group.label("http-httpsError");
      } else {
        /* Store this record for return, because it is internal with a matching
         * protocol, so its page should be checked in visitLinks: */
        internalLinksFromThisPage.push(linkRecord);
      }
      if (linkIsAbsolute) {
        if (link.matches(".field-name-field-related-links a")) {
          console.warn("absint link in related links", link);
          continue; //@debug
        }
        linkRecord.label("absoluteInternal");
      }
    } else {
      linkRecord.group.label("external");
      if (!linkIsToWebsite) {
        if (RECOGNIZED_SCHEMES.indexOf(linkProtocol) === -1) {
          linkRecord.group.label("unusualScheme");
        }
        if (linkProtocol === "mailto:") {
          linkRecord.group.label("Email");
          markElement(link, "yellow", "Email link");
        }
        else if (linkProtocol === "file:") {
          linkRecord.group.label("localFile");
          markElement(link, "blue", "File link");
        }
      }
    }
  } //Close for loop iterating over link elements
  return internalLinksFromThisPage;
} //Close function classifyLinks

function classifyImages(doc, curPageURL, quiet) {
  const IMAGES = doc.getElementsByTagName("img");
  for (const image of IMAGES) {
    const srcProp = image.src;
    const srcAttr = image.getAttribute("src");

    /* Images don't naturally have location properties, so use the URL api: */
    const imgSrcHostname = new URL(srcProp).hostname.toLowerCase();
    const isInternal = (imgSrcHostname === HOSTNAME);

    const imageRecord = new ElementRecord(curPageURL, image);
    imageRecord.group.label("image");
    if (srcAttr === null) {
      imageRecord.group.label("null");
    }

    /* Unfortunately, whether an image is available must be determined
     * asynchronously: */
    const newImage = makeElement("img", undefined, {src:image.src});
    newImage.onerror = ()=>imageRecord.label("unloaded");

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
  }//Close for loop iterating over images
}//Close function classifyImages

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
    let httpRequest = new XMLHttpRequest();
    allRequests.push(httpRequest);

    /*  Callbacks: */

    /* Before the full requested-resource is loaded, we can view the response
     * header for information such as the data type of the resource
     * (e.g. text/html vs application/pdf) and use that information to make
     * decisions on how to proceed w/o having to let the entire file be loaded. */
    function checkRequestHeaders(request) {
      /* Checks if the request resolved to a file rather than an HTML document: */
      function findURLExtension(url) {
        for (let i = url.length - 1; i >= 0; --i) {
          if (url.charAt(i) === ".") return url.substring(i+1).toLowerCase();
        }
        return undefined;
      }
      /* First, check the request's file extension: */
      let extension = findURLExtension(request.responseURL)
      let isRecognizedFile = (RECOGNIZED_FILE_TYPES.indexOf(extension) !== -1);
      if (isRecognizedFile) {
        pageData.label("file")
      }
      /* Then, check the request's content-type: */
      let contentType = request.getResponseHeader("Content-Type");
      let validContentType = "text/html";
      if (contentType.substr(0, validContentType.length) !== validContentType) {
        if (!isRecognizedFile) {
          pageData.label("unknownContentType");
        }
        request.resolvedToFile = true;
        request.abort();
      }
    }

    function normalResponseHandler(page, request) {
      if (!page) {
        console.error("Null response from " + URLOfPageToVisit +
". It may be an unrecognized file type.\n\tIt was linked-to from " + curPage);
        console.error(request);
        return;
      }

      if (recursive) {
        /* Check images on the given page: */
        classifyImages(page, URLOfPageToVisit);
        /* Recursively check the links found on the given page: */
        const newLinks = classifyLinks(page, URLOfPageToVisit);
        visitLinks(newLinks, URLOfPageToVisit, robotsTxt);
      }
    }

    function errorHandler(request) {
      /* If we aborted the request early due to the header telling us the
       * resource is a file, we shouldn't log another error, as everything
       * should've already been handled by checkRequestHeaders. */
      if (request.resolvedToFile) return;
      if (request.abortedDueToTimeout) return;

      /* Otherwise, something went wrong with the request: */
      if (request.readyState !== 4) {
        console.error("AN UNIDENTIFIED READYSTATE ERROR OCURRED!", request);
        throw new Error (
          "AN UNIDENTIFIED READYSTATE ERROR OCURRED!" + JSON.stringify(request)
        );
      }

      let msg = "";
      switch (request.status) {
        case 0:
          pageData.label("redirects");
          msg = "The request to " + URLOfPageToVisit + " caused an undefined \
error. The url probably either redirects to an external site. or is invalid. \
There may also be a networking issue, or another problem entirely.";
          msg += "\nUnfortunately, this script cannot distinguish between those possibilities.";
          break;
        case 400:
          pageData.label("badRequest");
          msg = "A 400 Error occurred when requesting " + URLOfPageToVisit + ", That means \
the request sent to the server was malformed or corrupted.";
          break;
        case 401:
          pageData.label("accessDenied");
          msg = "A 401 Error occurred when requesting " + URLOfPageToVisit + ". That means \
access was denied to the client by the server.";
          break;
        case 403:
          pageData.label("forbidden");
          msg = "A 403 Error occurred when requesting " + URLOfPageToVisit + ". That means \
the server considers access to the resource absolutely forbidden.";
          break;
        case 404:
          pageData.label("notFound");
          msg = "A 404 Error occurred when requesting " + URLOfPageToVisit + ". That means \
the server could not find the given page.";
          break;
        default:
          console.error("AN UNIDENTIFIED ERROR OCURRED!", request);
      }
      if (msg !== "") console.error(msg + "\n\tLinked-to from: " + curPage);
    }

    /* This function will execute whenever a document request fully resolves,
    * regardless of whether it was successful or not.
    *
    * By incrementing the instances counter before a request is made (aove
    * this method call) and decrementing it when a request completes, we can
    * execute code exactly when crawling is fully complete, by checking when
    * the total number of unresolved requests reaches 0.
    */
    function onComplete(request) {
      request.callbackComplete = true;
      requestCounter.decrement();
      if (requestCounter.count === 0) {
        requestCounter.setText("All requests complete!");
        window.clearTimeout(TIMEOUT_TIMER);
        presentResults();
      }
    }

    /* Start filing request: */
    httpRequest.onreadystatechange = function() {
      if (httpRequest.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        checkRequestHeaders(httpRequest);
      } else if (httpRequest.readyState === XMLHttpRequest.DONE) {
        if (httpRequest.status === 200) { //Code for "Good"
          normalResponseHandler(httpRequest.responseXML, httpRequest);
        } else {
          errorHandler(httpRequest);
        }
        onComplete(httpRequest);
      }
    }
    httpRequest.open("GET", URLOfPageToVisit);
    httpRequest.responseType = "document";

    httpRequest.send();
    httpRequest.sent = true;

    requestCounter.increment();
  } //Close for loop iterating over links
  /* If no internal links were ever found (e.g. single-page site): */
  if (requestCounter.count === 0) presentResults();
} //Close function visitLinks


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

/* Reformats a logging object to change the mapping. The returned object maps
 * from the url of a page (containing links classified by the given object) to
 * an array of corresponding link elements on that page. */
function loggingObjectReformat(logObj) {
  let pageToArrayOfElements = {};
  for (let url in logObj) {
    let pageList = logObj[url];
    for (let i = 0, len = pageList.length; i < len; ++i) {
      let caseObj = pageList[i];
      let keys = Object.keys(caseObj);
      if (keys.length !== 1) {
        console.error(`I messed up at url ${url} and caseObj ${JSON.stringify(caseObj)}`);
      }
      let pageContainingElement = keys[0];
      if (pageToArrayOfElements[pageContainingElement] === undefined) {
        pageToArrayOfElements[pageContainingElement] = [caseObj[pageContainingElement]];
      } else {
        pageToArrayOfElements[pageContainingElement].push(caseObj[pageContainingElement]);
      }
    }
  }
  return pageToArrayOfElements;
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
  headerStr += (timedOut) ? " (incomplete):" : ":";
  const modalTitle = makeElement("h1", headerStr, {id:"crlr-title"});
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
  const modalContent = makeElement("div", undefined, {id:"crlr-content"});
  ModalBuffer.appendChild(modalContent);

  /* Create textbox for specifying desired output: */
  const autoCompleteItems = [];
  let requiredLength = 0;

  const optionElementFromLabel = (label, labelTable)=>{
    const labelHasMembers = (labelTable[label] !== undefined);

    /* Gecko browsers (Firefox, Edge, etc.) will display the label rather than
     * the value in the drop-down list if both are present, whereas webkit
     * browsers (Chrome and Safari) will display both, with the label to the
     * right and slightly faded. To ensure all users see the same info, We use
     * different labels for the different browser engines: */
    let optionEleLabelProp;
    if (labelHasMembers) {
      optionEleLabelProp = "";
    } else {
      optionEleLabelProp = (isBrowserWebkit) ? "Empty" : `${logObjName} (Empty)`;
    }
    const optionEle = makeElement(
      "option",
      undefined,
      {
        value: label,
        label: optionEleLabelProp
      }
    );
    return optionEle;
  }

  /* Iterate over Group labels, then iterate over Element labels:
   * (The order doesn't actually matter.) */
  for (const label of GROUP_LABELS) {
    requiredLength = Math.max(requiredLength, label.length);
    autoCompleteItems.push(
     optionElementFromLabel(label, RecordGroup.LabelTable)
    );
  }
  for (const label of ELEMENT_LABELS) {
    requiredLength = Math.max(requiredLength, label.length);
    autoCompleteItems.push(
      optionElementFromLabel(label, ElementRecord.LabelTable)
    );
  }
  /* Make the textbox for inputting the name of the object you want to view: */
  const clearInputButton = makeElement(
    "button",
    "✖", //"x" cross symbol
    {
      id: "crlr-input-clear",
      "data-for": "crlr-input-textbox"
    }
  );
  const autoCompleteList = makeElement(
    "datalist",
    autoCompleteItems,
    {
      id: "crlr-autocomplete-list"
    }
  );
  const inputTextBox = makeElement(
    "input",
    undefined,
    {
      id: "crlr-input-textbox",
      type: "text",
      value:"link",
      list: "crlr-autocomplete-list",
      size: requiredLength
    }
  )
  const logObjInputContainer = makeElement(
    "div",
    [clearInputButton, autoCompleteList, inputTextBox],
    {
      id: "crlr-textbox-controls",
    }
  );
  clearInputButton.addEventListener(
    "click",
    function clearInput() {
      inputTextBox.value = "";
      inputTextBox.focus();
    }
  );

  /* For browsers without support for :focus-within: */
  logObjInputContainer.addEventListener(
    "focusin",
    function addFocus() {
      logObjInputContainer.classList.add("focus-within");
    }

  );
  logObjInputContainer.addEventListener(
    "focusout",
    function remFocus() {
      logObjInputContainer.classList.remove("focus-within");
    }
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
  const preCont = makeElement("div", pre, {class:"crlr-output"});
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
    const recordList = getAllRecordsLabelled(label);
    const labelData = Object.create(null);
    if (recordList !== null) {
      for (const record of recordList) {
        let key, val;
        if (invertMapping) {
          /* Use the property here, so that absolute and relative elements
           * correspond to the same key. If the label is anchor, don't remove
           * the anchor from hrefs of links: */
          const retainAnchor = (label === "anchor");
          key = getHrefOrSrcProp(record.element, retainAnchor);
          val = record.document;
        } else {
          /* Use the attribute here, so that relative elements can be founded by
           * using ctrl + f on the DOM: */
          key = record.document;
          val = getHrefOrSrcAttr(record.element)
        }
        maybeArrayPush(labelData, key, val);
      }
    }
    return labelData;
  }
  /* Inverse of the above. The mapping is from element href/src to an array of
   * documents containing that
  const labelToElementMap

  /* For handling the output of logging objects to the user: */
  const outputEventFns = (function() {
    let labelOfCurrentlyDisplayedData;
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
      pre.innerHTML = objJSONPreview;

      /* Prepare data for the download link and the text around it: */
      let beforeLinkText = "";
      let linkText;
      let afterLinkText = "";
      if (previewTooLong) {
        beforeLinkText = "Note that the data shown above is only a preview, as \
the full data was too long. ";
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
      if (timedOut) downloadName += "_(INCOMPLETE)";
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
      clearChildren(dlLinkPara);
      appendChildren(dlLinkPara, [beforeLinkText, dlLink, afterLinkText]);
    }
    /* Reads which log object to output, what format to use, and calls
     * outputLogObjToModal to actually change what is shown to the user: */
    function updateOutput() {
      const wantedLabel = inputTextBox.value;

      /* If the user has not inputted a valid label, don't change the currently
       * displayed data (they may be in the middle of typing): */
      if (!ELEMENT_LABELS.has(wantedLabel) && !GROUP_LABELS.has(wantedLabel)) {
        return;
      }
      labelOfCurrentlyDisplayedData = wantedLabel;
      usingAltFormat = altFormatCheckBox.checked;
      outputDataToModal(wantedLabel);
    }
    /* Return object containing functions: */
    return {
      updateOutput,
    }
  })();//Close closure

  /* Call the function immediately so that the data for the default label
   * is displayed immediately: */
  outputEventFns.updateOutput();
  inputTextBox.addEventListener("input", outputEventFns.updateOutput);
  altFormatCheckBox.addEventListener("change", outputEventFns.updateOutput);

  const endTime = performance.now();
  let runningTime = Math.round((endTime - startTime)/10)/100;
  let timeInfoEle = makeElement("p",`(Crawling took ${runningTime} seconds)`,
      {id:"crlr-time"}
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
  }

  /* Methods: */
  /* @Static */
  this.parseText = function (rawText) {
    let disallowed = [];
    let allowed = [];
    let sitemap = [];

    let lines = rawText.split(/[\n\r]/);

    /* Do allow and disallow statements in this block apply to us? I.e. are they
     * preceded by a user-agent statement which matches us? */
    let validUserAgentSection = true;
    for (let i = 0, len = lines.length; i < len; ++i) {
      let line = lines[i].trim();

      /* Skip empty and comment lines: */
      if (line.length === 0 || line.charAt(0) === "#") continue;

      /* Split the line by the first colon ":": */
      let parsedLine = (function() {
        let splitPoint = line.indexOf(":");
        if (splitPoint === -1) {
          return undefined;
        }
        let firstHalf = line.substring(0, splitPoint);
        let secondHalf = line.substring(splitPoint + 1);
        return [firstHalf, secondHalf];
      })();
      if (parsedLine === undefined) {
        console.warn(`Don't understand: "${line}"`);
      }
      let clauseType = parsedLine[0].trim().toLowerCase();
      let clauseValue = parsedLine[1].trim();

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
  }

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

    let patternSections = parsedPattern.split("*");
    let patternIndex = 0;
    for (let strIndex = 0, len = str.length; strIndex < len; /*@noIncrement*/) {
      let subPat = patternSections[patternIndex];

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
  }
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
    let pagePath = fullUrl.substr(DOMAIN.length); //@Refactor use location api?

    /* Allow statements supersede disallow statements, so we can
     * check the allowed list first and shortcut to true if we
     * find a match: */
    for (let i = 0, len = this.patterns.allow.length; i < len; ++i) {
      let pattern = this.patterns.allow[i]
      if (this.matchesPattern(pagePath, pattern)) return true;
    }
    for (let i = 0, len = this.patterns.disallow.length; i < len; ++i) {
      let pattern = this.patterns.disallow[i]
      if (this.matchesPattern(pagePath, pattern)) return false;
    }
    /* If this page is on neither the allowed nor disallowed
     * list, then we can assume it's allowed: */
    return true;
  }

  this.requestAndParse = function (onComplete) {
    if (this.ignoreFile) {
      /* Ensure asynchronous execution: */
      window.setTimeout(onComplete(null));
      return;
    }

    let httpRequest = new XMLHttpRequest();
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
    }
    httpRequest.open("GET", "/robots.txt");
    httpRequest.send();
  }
}

const robotsTxtHandler = new RobotsTxt();

function startCrawl(robotsTxt, flagStr) {
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

  /* Setup robotsTxt handler and start the crawl: */
  robotsTxt.requestAndParse(function afterRobotsTxtParse() {
    /* Handle disallowMatchFlag AFTER parsing, because parsing overwrites the
     * patterns property: */
    robotsTxt.patterns.disallow.push(...userDisallowed);
    Object.freeze(robotsTxt);

    const anchorlessURL = urlRemoveAnchor(window.location);
    classifyImages(document, anchorlessURL);
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

startCrawl(robotsTxtHandler, "");
