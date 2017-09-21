/* @idea Use some kind of heuristics to estimate how much time in a crawl is
 * remaining, so it can be shown to the user. Like, record current timing and
 * then record number of new internal links found on a given page as a
 * function of that page's depth from the origin. We should then be able to
 * apply some kind of regression to the data to extrapolate when we'll reach
 * 0 new links */

/* @idea If the user navigates away from the page w/ a results modal open,
 * save the data to local storage or something so that they can return to it
 * later if they want. Like, if they come back to the page w/o clearing storage,
 * it will automatically re-open the modal w/ the same data. Make sure that
 * there is also some extra prompt saying that it's old crawl-data, and asking
 * them if they'd like to close it or run a new crawl. */

/* @TODO Fix the object selection textbox in the modal for Firefox */

'use strict';
const startTime = performance.now();

/* Warn the user about navigating away during crawl: */
window.addEventListener("beforeunload", function (e) {
  /* Note: In modern browsers, these messages are ignored as a security feature,
   * and a default message is displayed instead. */
  const confirmationMessage = "Warning: Navigating away from the page during a site-crawl will cancel the crawl, losing all progress. Are you sure you want to continue?";
  e.returnValue = confirmationMessage;     // Gecko, Trident, Chrome 34+
  return confirmationMessage;              // Gecko, WebKit, Chrome <34
});

/* Settings variables: */
const RECOGNIZED_FILE_TYPES = ["doc", "docx", "gif", "jpeg", "jpg", "pdf",
    "png", "ppt", "pptx", "xls", "xlsm", "xlsx"];
const RECOGNIZED_SCHEMES = ["mailto:", "tel:"];

const BANNED_STRINGS = ["drupaldev"];
function containsBannedString(href) {
  for (let i = 0, len = BANNED_STRINGS.length; i < len; ++i) {
    let badStr = BANNED_STRINGS[i];
    if (href.indexOf(badStr) !== -1) return badStr;
  }
  return false;
}

const MAX_TIMEOUT = 60*1000; //Miliseconds
let timedOut = false;
let allRequests = [];
const TIMEOUT_TIMER = window.setTimeout(()=>{
    timedOut = true;
    for (let r = 0, len = allRequests.length; r < len; ++r) {
      let request = allRequests[r];
      /* If the request has already completed, don't abort it */
      if (request.readyState === 4) continue;

      /* We have to assign this property before calling the abort method,
       * because the abort method will call the requests onreadystatechange
       * method, which needs to know why the request failed. */
      request.abortedDueToTimeout = true;
      request.abort();
      console.warn("Aborting request at index " + r + " of allRequests");
    }
  },
  MAX_TIMEOUT
);

/* Script relevant: */
let visited = {};
let allLinks = {};

let nullLinks = {};
let anchorLinks = {};
let externalLinks = {};
let absoluteInternalLinks = {};

let robotsDisallowed = {};
let redirects = {};
let notFound = {};
let forbidden = {};
let accessDenied = {};
let bannedStrings = {};
let files = {};
let localFiles = {};
let unusualScheme = {};
let ipAddresses = {};
let unknownContentType = {};

let linkLoggingObjects = {visited, allLinks, externalLinks, nullLinks, anchorLinks, absoluteInternalLinks, robotsDisallowed, redirects, notFound, forbidden, accessDenied, bannedStrings, files, localFiles, unusualScheme, ipAddresses, unknownContentType};

let allImages = {};

let nullImages = {};
let externalImages = {};
let unloadedImages = {};
let bannedStringImages = {};
let absoluteInternalImages = {};

let imageLoggingObjects = {allImages, externalImages, unloadedImages, bannedStringImages, absoluteInternalImages};

/* Takes the loggingObjects and exchanges the HTMLElements in them w/ some
 * property of those elements (href by default). reducerFn is passed each
 * element and returns what that element is substituted w/ in the object. */
function logObjToString(logObj, reducerFn) {
  const replaceElements = (key, val) => {
    if (val instanceof HTMLElement) {
      return reducerFn(val);
    }
    return val;
  };
  let logObjJSON = JSON.stringify(logObj, replaceElements, 2);

  /* Put objects which only have one key:value pair on a single line, rather
   * than putting the opening bracket and closing bracket on separate lines: */
  logObjJSON = logObjJSON.replace(
      /(^[^\S\r\n]*\{)[^\S\r\n]*$[\r\n]*^\s*([^\r\n}]+$)[\r\n]*^\s*(\})/gm,
      "$1$2$3"
  );

  return logObjJSON;
}

/* Reformats a logging object to change the mapping. The returned object maps
 * from the url of a page (containing links classified by the given object) to
 * an array of corresponding link elements on that page. */
function loggingObjectReformat(logObj) {
  let pageToArrayOfBrokenLinks = {};
  for (let url in logObj) {
    let caseList = logObj[url];
    for (let i = 0, len = caseList.length; i < len; ++i) {
      let caseObj = caseList[i];
      let keys = Object.keys(caseObj);
      if (keys.length !== 1) console.error(`I messed up at url ${url} and caseObj ${JSON.stringify(caseObj)}`);
      let pageContainingBrokenLink = keys[0];
      if (pageToArrayOfBrokenLinks[pageContainingBrokenLink] === undefined) {
        pageToArrayOfBrokenLinks[pageContainingBrokenLink] = [caseObj[pageContainingBrokenLink]];
      } else {
        pageToArrayOfBrokenLinks[pageContainingBrokenLink].push(caseObj[pageContainingBrokenLink]);
      }
    }
  }
  return pageToArrayOfBrokenLinks;
}

/* Collects different sets of loggingObjects and information on how to output
 * them: */
let logObjMetaData = [
  {
    logObjects: linkLoggingObjects,
    toString (obj) {
      return logObjToString( obj, (ele => ele.getAttribute("href")) );
    }
  },
  {
    logObjects: imageLoggingObjects,
    toString (obj) {
      return logObjToString( obj, (ele => ele.getAttribute("src")) );
    }
  },
];

/* Function definitions: */

/* Makes a box appear on the user interface with a counter showing
 * the number of live (unresolved) http requests currently waiting: */
const requestCounter = (function() {
  /* Create display: */
  const disp = document.createElement("p");
  let text = document.createTextNode("0");
  disp.appendChild(text);
  disp.id="instancesDisplay";

  disp.style.padding = "2px";
  disp.style.border = "5px solid green";
  disp.style.backgroundColor = "white";
  disp.style.position = "fixed";
  disp.style.zIndex = "999999";
  disp.style.top = "2em";
  disp.style.left = "2em";
  disp.style.margin = "0";
  disp.style.display = "table";

  document.body.insertBefore(disp, document.body.childNodes[0]);

  /* Return an object which will allow other code
   * to increment and decrement the counter: */
  return {
    displayElement: disp,
    count: 0,
    setText: function setText(text) {
      disp.innerHTML = text;
    },
    increment: function increment() {
      ++this.count;
      disp.innerHTML = this.count;
    },
    decrement: function decrement() {
      --this.count;
      disp.innerHTML = this.count;
    }
  }
})();

function urlRemoveAnchor(locationObj) {
  if (typeof locationObj === "string") {
    return urlRemoveAnchor(makeElement("a", undefined, {href: locationObj}));
  }

  return locationObj.origin + locationObj.pathname + locationObj.search;
}

function visitLinks(curPage, linkObj) {
  console.log("Checking links found on: " + curPage)

  for (let url in linkObj) {
    /* Note: this version is slightly different to the one found in classifyLinks,
     * as it uses linkObj which is already filled out by classifyLinks. */
    function recordLinkTo(...objectsToLogTo) {
      let linkData = linkObj[url]; //@note This is an array
      for (let i = 0, len = objectsToLogTo.length; i < len; ++i) {
        let obj = objectsToLogTo[i];

        /* If the given logging object already has an array of entries for the
         * given URL: */
        if (obj[url] !== undefined) {
          /* Add the contents of the array from linkObj for the current url
           * to the given loggingObject's existing array. */
          for (let dataIndex = 0, len = linkData.length; dataIndex < len; ++dataIndex) {
            obj[url].push(linkData[dataIndex]);
          }
        }
        /* Otherwise, linkObj's array of entries will serve as the initial array
         * for the given logging object: */
        else obj[url] = linkData;
      }
    }
    if (url !== urlRemoveAnchor(url)) throw new Error(`This url has an anchor and shouldn't ${url}...`);

    /* Don't re-check a link which is a known redirect: */
    if (redirects[url] !== undefined) {
      recordLinkTo(redirects);
      continue;
    }

    /* Do not re-analyze a page we have already visited: */
    if (visited[url] !== undefined) {
      recordLinkTo(visited);
      continue;
    }
    /* I sorta have to repeat myself here to make sure we properly skip over
     * only links we've already recorded. */
    recordLinkTo(visited);

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
      let extension = findURLExtension(request.responseURL)
      let isRecognizedFile = (RECOGNIZED_FILE_TYPES.indexOf(extension) !== -1);
      if (isRecognizedFile) {
        recordLinkTo(files);
      }

      let contentType = request.getResponseHeader("Content-Type");
      let validContentType = "text/html";
      if (contentType.substr(0, validContentType.length) !== validContentType) {
        if (!isRecognizedFile) recordLinkTo(unknownContentType);
        request.resolvedToFile = true;
        request.abort();
      }
    }

    function normalResponseHandler(page, details) {
      if (!page) {
        console.error("Null response from " + url + ". It may be an unrecognizes file type.\n\tIt was linked-to from " + curPage);
        console.error(details);
        return;
      }

      /* Check images on the given page: */
      classifyImages(page, url);
      /* Recursively check the links found on the given page: */
      let newLinks = classifyLinks(page, url,  true);
      visitLinks(url, newLinks);
    }

    function errorHandler(details) {
      /* If we aborted the request early due to the header telling us the
       * resource is a file, we shouldn't log another error, as everything
       * should've already been handled by checkRequestHeaders. */
      if (details.resolvedToFile) return;
      if (details.abortedDueToTimeout) return;

      /* Otherwise, something went wrong with the request: */
      if (details.readyState !== 4) {
        console.error("AN UNIDENTIFIED READYSTATE ERROR OCURRED!", details);
        throw new Error ("AN UNIDENTIFIED READYSTATE ERROR OCURRED!" + JSON.stringify(details));
      }

      let msg = "";
      switch (details.status) {
        case 0:
          recordLinkTo(redirects);
          msg = "The request to " + url + " caused an undefined error. The url robably either redirects to an external site. or is invalid. There may also be a networking issue, or another problem entirely.";
          msg += "\nUnfortunately, this script cannot distinguish between those possibilities.";
          break;
        case 401:
          recordLinkTo(accessDenied);
          msg = "A 401 Error occurred when requesting " + url + ". That means access was denied to the client by the server.";
          break;
        case 403:
          recordLinkTo(forbidden);
          msg = "A 403 Error occurred when requesting " + url + ". That means the server considers access to the resource absolutely forbidden.";
          break;
        case 404:
          recordLinkTo(notFound);
          msg = "A 404 Error occurred when requesting " + url + ". That means the server could not find the given page.";
          break;
        default:
          console.error("AN UNIDENTIFIED ERROR OCURRED!", details);
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
    function onComplete(xhr) {
      xhr.callbackComplete = true;
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
    httpRequest.open("GET", url);
    httpRequest.responseType = "document";

    httpRequest.send();
    httpRequest.sent = true;

    requestCounter.increment();
  } //Close for loop iterating over links
  /* If no internal links were ever found (e.g. single-page site): */
  if (requestCounter.count === 0) presentResults();
} //Close function visitLinks

function classifyLinks(doc, curPageURL, quiet) {
  const quietLog = (quiet) ? ()=>{} : console.log;

  const LINKS = doc.getElementsByTagName("a");
  const HOSTNAME = window.location.hostname.toLowerCase();

  /* Contains the URLs of all of the local (same-domain) pages linked to from
   * this page: */
  let internalLinksFromThisPage = {};

  /* Loop over links: */
  for (let i = 0, len = LINKS.length; i < len; ++i) {
    let link = LINKS[i];
    let hrefAttr = link.getAttribute("href");

    /* Function for adding data about a link to data-logging objects: */
    function recordLinkTo(...objectsToLogTo) {
      let linkData = {};
      linkData[curPageURL] = link;
      let hrefWithoutAnchor = urlRemoveAnchor(link);
      for (let i = 0, len = objectsToLogTo.length; i < len; ++i) {
        let obj = objectsToLogTo[i];
        if (obj[hrefWithoutAnchor] !== undefined) {
          obj[hrefWithoutAnchor].push(linkData);
        } else {
          obj[hrefWithoutAnchor] = [linkData];
        }
      }
    }

    /* Handle links with no HREF attribute, such as anchors or those used as
     * buttons: */
    if (hrefAttr === null) {
      recordLinkTo(nullLinks);
      link.style.border = "2px solid orange";
      link.title = (link.title) ? link.title + "\nNull link" : "Null link";
      continue;
    }
    hrefAttr = hrefAttr.toLowerCase();

    /* All non-null links are recorded to the allLinks object: */
    recordLinkTo(allLinks);

    let bannedStr = containsBannedString(link.href);
    if (bannedStr) {
      recordLinkTo(bannedStrings);

      console.error("Found link " + hrefAttr + " containing a banned string: " + bannedStr + ".\n\tLinked-to from: " + curPageURL);
      link.style.border = "4px dashed red";
      link.title = (link.title) ? link.title + "\nBANNED WORD LINK" : "BANNED WORD LINK";

      /* Don't parse the link further. Banned-string links will not be crawled. */
      continue;
    }

    let linkIsAbsolute = (hrefAttr === link.href.toLowerCase());
    let linkProtocol = link.protocol.toLowerCase();
    let linkIsToWebsite = /^https?:$/i.test(linkProtocol);
    let linkIsInternal =
        (linkIsToWebsite && (link.hostname.toLowerCase() === HOSTNAME));

    /* Anchor link: */
    if (link.hash !== "") {
      /* Record link to anchor link. We don't use recordLinkTo here, because
      * that would remove the anchor/fragment/hash portion of the url.
      * Normally that's desired, since it prevents a link with a hash from
      * being recorded as different leading to a different page than a link
      * without an anchor. Just here, though, we want the difference: */
      let linkData = {};
      linkData[curPageURL] = link;
      if (anchorLinks[link.href] !== undefined) {
        anchorLinks[link.href].push(linkData);
      } else anchorLinks[link.href] = [linkData];

      link.style.border = "2px solid pink";
      link.title = (link.title) ? link.title + "\nAnchor link" : "Anchor link";
    }

    /* Classify link based on the variables set above */
    if (linkIsInternal) {
      if (isPageCrawlable(link.href)) {
        recordLinkTo(internalLinksFromThisPage);
      } else {
        recordLinkTo(robotsDisallowed);
        link.style.color = "orange"
        link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
      }

      if (linkIsAbsolute) {
        if (link.matches(".field-name-field-related-links a")) {
          console.warn("absint link in related links", link);
          continue;//@debug
        }
        recordLinkTo(absoluteInternalLinks);
        quietLog(link, i + ":Absolute Internal:\t" + hrefAttr);
      } else {
        /* Site-Root-Relative Link: */
        if (hrefAttr.substr(0,1) === "/") {
          quietLog(link, i + ":Root Relative:\t" + hrefAttr);
        }
        /* Page-Relative and other links: */
        else {
          quietLog(link, i + ":Page Relative(?):\t" + hrefAttr);
        }
      }
    }
    /* External Links: */
    else {
      recordLinkTo(externalLinks);

      /* If the link contains a string which resembles an IP address: */
      if (/(?:\d{1,3}\.){3}\d{1,3}/.test(hrefAttr)) {
        recordLinkTo(ipAddresses);
      }
      if (!linkIsToWebsite) {
        if (RECOGNIZED_SCHEMES.indexOf(linkProtocol) === -1) {
          recordLinkTo(unusualScheme);
        }
        if (linkProtocol === "mailto:") {
          link.style.border = "2px solid yellow";
          link.title = (link.title) ? link.title + "\nEmail link" : "Email link";
        }
        else if (linkProtocol === "file:") {
          recordLinkTo(localFiles);

          link.style.border = "2px dashed blue";
          link.title = (link.title) ? link.title + "\nFile link" : "File link";
        }
      }
    } //Close else block classifying external links
  } //Close for loop iterating over link elements
  return internalLinksFromThisPage;
} //Close function classifyLinks

function classifyImages(doc, curPageURL, quiet) {
  const IMAGES = doc.getElementsByTagName("img");
  const HOSTNAME = window.location.hostname.toLowerCase();

  /* Contains the URLs of all of the local (same-domain) pages linked to from
   * this page: */
  let internalLinksFromThisPage = {};

  /* Loop over links: */
  for (let i = 0, len = IMAGES.length; i < len; ++i) {
    let image = IMAGES[i];
    let srcProp = image.src;
    let srcAttr = image.getAttribute("src");

    /* HTMLImageElements don't have location properties, sadly, so we need to
     * create an A(nchor) element with the image's src as its href. This
     * temporary element has location properties automatically populated, so we
     * can access them: */
    let imgSrcHostname = makeElement("a", undefined, {href: srcProp}).hostname
        .toLowerCase();
    let isInternal = (imgSrcHostname === HOSTNAME);

    /* Function for adding data about a image to data-logging objects: */
    function recordImageTo(...objectsToLogTo) {
      let imageData = {};
      imageData[curPageURL] = image;
      for (let i = 0, len = objectsToLogTo.length; i < len; ++i) {
        let obj = objectsToLogTo[i];
        if (obj[srcProp] !== undefined) {
          obj[srcProp].push(imageData);
        } else {
          obj[srcProp] = [imageData];
        }
      }
    }
    recordImageTo(allImages);
    if (srcAttr === null) {
      recordImageTo(nullImages);
    }
    if (!image.complete) {
      recordImageTo(unloadedImages);
    }
    if (containsBannedString(srcProp)) {
      recordImageTo(bannedStringImages);
    }
    if (!isInternal) {
      recordImageTo(externalImages);
    }
    if (isInternal && (srcProp === srcAttr)) {
      recordImageTo(absoluteInternalImages);
    }
  }//Close for loop iterating over images
}//Close function classifyImages


/**
 * Code for presenting results to the user when crawling is done:
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
      let text = document.createTextNode(String(item));
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

/**
 * Makes an HTML element with content. This is similar to the
 * document.createElement() method, but allows text or other elements to
 * be added as a child in-place. Multiple children may be specified by
 * using an array. The optional attrObj parameter allows for attributes
 * such as id, class, src, and href to also be specified in-place.
 */
function makeElement(type, content, attrObj) {
  let newEle = document.createElement(type);
  if (content !== undefined) {
    appendChildren(newEle, content)
  }
  if (attrObj !== undefined) {
    for (let attribute in attrObj) {
     newEle.setAttribute(attribute, attrObj[attribute]);
    }
  }
  return newEle;
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

  /* If no break-string is given, cutOffPoint right on the character: */
  if (breakStr === undefined) return str.substring(0, cutOffPoint);

  cutOffPoint = str.lastIndexOf(breakStr, cutOffPoint);

  /* If the breakStr character can't be found, return an empty string: */
  if (cutOffPoint === -1) return "";
  return str.substring(0, cutOffPoint);
}

/* This is called when the crawling is fully complete. it is the last
 * part of the script ot be executed: */
function presentResults() {
  /* Remove the counter now that requests are finished */
  requestCounter.displayElement.remove();

  /* Make new style sheet for modal: */
  let myCSS = `/* Reset style on modal elements: */
  #crlr-modal, #crlr-modal * {
    all: initial;
    box-sizing: border-box;
  }
  /* all: initial sets everything to display: inline, so reset block elements to
   * display: block (yes this has to be this verbose, sadly): */
  #crlr-modal p, #crlr-modal h1, #crlr-modal h2, #crlr-modal h3, #crlr-modal h4, #crlr-modal h5, #crlr-modal h6, #crlr-modal ol, #crlr-modal ul, #crlr-modal pre, #crlr-modal address, #crlr-modal blockquote, #crlr-modal dl, #crlr-modal div, #crlr-modal fieldset, #crlr-modal form, #crlr-modal hr, #crlr-modal noscript, #crlr-modal table {
    display: block;
  }

  /* Gives headers proper size: */
  #crlr-modal h1 {
    font-size: 2em;
    font-weight: bold;
    margin-top: 0.67em;
    margin-bottom: 0.67em;
  }
  #crlr-modal h2 {
    font-size: 1.5em;
    font-weight: bold;
    margin-top: 0.83em;
    margin-bottom: 0.83em;
  }
  #crlr-modal h3 {
    font-size: 1.17em;
    font-weight: bold;
    margin-top: 1em;
    margin-bottom: 1em;
  }
  #crlr-modal h4 {
    font-weight: bold;
    margin-top: 1.33em;
    margin-bottom: 1.33em;
  }
  #crlr-modal h5 {
    font-size: .83em;
    font-weight: bold;
    margin-top: 1.67em;
    margin-bottom: 1.67em;
  }
  #crlr-modal h6 {
    font-size: .67em;
    font-weight: bold;
    margin-top: 2.33em;
    margin-bottom: 2.33em;
  }

  #crlr-modal * {
    font-family: sans-serif;
  }
  #crlr-modal pre, #crlr-modal pre * {
    font-family: monospace;
    white-space: pre;
  }
  /* Reset link styling: */
  #crlr-modal a:link { /* Unvisited */
    color: #00e;
    text-decoration: underline;
  }
  /* visited link */
  #crlr-modal a:visited { /* Visited */
    color: #551a8b
  }
  /* mouse over link */
  #crlr-modal a:hover {
    color: darkred;
  }
  /* selected link */
  #crlr-modal a:active {
    color: red;
  }
  #crlr-modal a:focus {
    outline: 2px dotted #a6c7ff; /* Light blue */
  }

  /* Base-Styling for modal: */
  #crlr-modal {
    border: 5px solid #0000a3; /* Darkish blue */
    border-radius: 1em;
    background-color: #fcfcfe; /* Very-slightly blueish white */
    position: fixed;
    z-index: 99999999999999;
    top: 2em;
    bottom: 2em;
    left: 2em;
    right: 2em;
    margin: 0;
    overflow: hidden;

    color: #222;
    box-shadow: 2px 2px 6px 1px rgba(0, 0, 0, 0.4);

    display: flex;
    flex-direction: column;
  }

  #crlr-modal #crlr-min {
    border: 1px solid gray;
    padding: 0.5em;
    border-radius: 5px;
    background-color: rgba(0,0,20,0.1);
  }
  #crlr-modal #crlr-min:hover {
    border-color: blue;
    background-color: rgba(0,0,20,0.2);
  }
  #crlr-modal #crlr-min:focus {
    box-shadow: 0 0 0 1px #a6c7ff;
    border-color: #a6c7ff;
  }

  /* Header stuff */
  #crlr-modal .flex-row {
    display: flex;
  }
  #crlr-modal .flex-row > * {
    margin-top: 0;
    margin-bottom: 0;
    margin-right: 16px;
  }
  #crlr-modal .flex-row > *:last-child {
    margin-right: 0;
  }

  #crlr-modal #crlr-header {
    align-items: flex-end;

    padding: 0.5em;
    border-bottom: 1px dotted #808080;
    width: 100%;
    background-color: #e1e1ea;
  }
  #crlr-modal #crlr-header #crlr-header-msg {
    align-items: baseline;
  }

  #crlr-modal #crlr-content {
    flex: 1;
    padding: 1em;
    overflow-y: auto;
    /* For some zoom levels, a horizontal scrollbar appears (this is probably a
     * floating-point bug or something) which is undesirable. Content isn't
     * supposed to actually escape the content-div horizontally, so it's save
     * to hide it: */
    overflow-x: hidden;
  }
  #crlr-modal #crlr-content > * {
    margin-bottom: 10px;
  }
  #crlr-modal #crlr-content > :last-child {
    margin-bottom: 0;
  }

  /* Hide all elements but the minimize button... */
  #crlr-modal.minimized *:not(#crlr-min) {
    display:none;
  }
  /* ...Then re-appear the header element, which contains the button, so that
   * the button doesn't get hidden: */
  #crlr-modal.minimized #crlr-header {
    display: flex;
    margin: 0;
    border: none;
  }
  #crlr-modal.minimized {
    display: table;
    background-color: #e1e1ea;
    opacity: 0.2;
    transition: opacity .2s;
  }
  #crlr-modal.minimized:hover, #crlr-modal.minimized:focus-within {
    opacity: 1;
  }

  #crlr-modal.minimized #crlr-min {
    margin: 0;
  }

  /* Output styling: */
  #crlr-modal #crlr-inputs * {
    font-size: 1.25em;
  }
  #crlr-modal #crlr-input-clear {
    background-color: #ededf2;
    margin-right: 0.25em;
    padding: 0px 0.25em;
    border: none;
    font-size: 1em;
  }
  #crlr-modal #crlr-input-clear:active {
    box-shadow: inset 1px 1px 2px 1px rgba(0,0,0,0.25);
  }
  #crlr-modal #crlr-input-clear:focus {
    outline: 2px solid #a6c7ff; /* Light blue */
  }

  #crlr-modal #crlr-textbox-controls {
    border: 2px solid transparent;
    border-bottom: 2px solid #b0b0b0;
    background-color: #ededf2;
    transition: border 0.2s;
  }
  #crlr-modal #crlr-textbox-controls.focus-within, #crlr-modal #crlr-textbox-controls:focus-within {
    border: 2px solid #a6c7ff; /* Light blue */
  }
  #crlr-input-textbox {
    background-color: transparent;
    border: none;
  }
  #crlr-modal #crlr-autocomplete-list {
    display: none;
  }

  /* For checkboxes: */
  #crlr-modal input[type="checkbox"] {
    opacity: 0;
    margin: 0;
  }
  #crlr-modal input[type="checkbox"] + label{
    padding-top: 0.1em;
    padding-bottom: 0.1em;
    padding-left: 1.75em;
    position: relative;
    align-self: center;
  }
  #crlr-modal input[type="checkbox"] + label::before {
    position: absolute;
    left: .125em;
    height: 1.4em;
    top: 0;
    border: 1px solid gray;
    padding: 0 .2em;
    line-height: 1.4em;
    background-color: #e1e1ea;
    content: "✔";
    color: transparent;
    display: block;
  }
  #crlr-modal input[type="checkbox"]:checked + label::before {
    color: #222;
  }
  /* When the checkbox is selected: */
  #crlr-modal input[type="checkbox"]:focus + label::before {
    box-shadow: 0 0 0 1px #a6c7ff;
    border-color: #a6c7ff;
  }
  /* When the checkbox is pressed: */
  #crlr-modal input[type="checkbox"]:active + label::before {
    box-shadow: inset 1px 1px 2px 1px rgba(0,0,0,0.25);
  }

  #crlr-modal .crlr-output {
    display: inline-block;
    max-width: 100%;
  }
  #crlr-modal .crlr-output > pre {
    max-height: 200px;
    padding: 0.5em;
    overflow: auto;
    border: 1px dashed gray;
    background-color: #e1e1ea;
  }
  #crlr-modal.browser-gecko .crlr-output > pre {
    overflow-y: scroll;
  }`;

  let styleEle = makeElement("style", myCSS, {title:"crlr.js.css"});
  document.head.appendChild(styleEle);
  window.crlrCSS = styleEle.sheet;
  if (crlrCSS.title !== "crlr.js.css") console.error("Someone stole our stylesheet!");

  const modal = makeElement("div", undefined, {id: "crlr-modal"});
  /* For Firefox, Edge, IE, and other Gecko Browsers: */
  let isBrowserWebkit = /webkit/i.test(navigator.userAgent);
  modal.classList.add(isBrowserWebkit ? "browser-webkit" : "browser-gecko");

  /* Prevent click events on the modal affecting events on the rest of the page: */
  modal.addEventListener("click", function(e){
      if (!e) e = window.event;
      e.cancelBubble = true;
      if (e.stopPropagation) e.stopPropagation();
    }
  );

  /* Create button for minimizing modal so that the site can be used normally: */
  const minimizeButton = makeElement("button", "🗕", {id: "crlr-min"});

  minimizeButton.type = "button";

  /* Make the button toggle other content in the modal to/from display: none: */
  minimizeButton.onclick = () => modal.classList.toggle("minimized");
  modal.appendChild(minimizeButton);

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
  modal.appendChild(modalHeader);

  const modalContent = makeElement("div", undefined, {id:"crlr-content"});
  modal.appendChild(modalContent);

  /* Create textbox for specifying desired output: */
  let autoCompleteItems = [];
  let requiredLength = 0;
  for (let i = 0, len = logObjMetaData.length; i < len; ++i) {
    let logObjGroup = logObjMetaData[i].logObjects;
    for (let logObjName in logObjGroup) {
      requiredLength = Math.max(requiredLength, logObjName.length);
      let logObjsInGroup = Object.getOwnPropertyNames(logObjGroup[logObjName]);
      let logObjIsEmpty = (logObjsInGroup.length === 0);

      /* Gecko browsers (Firefox, Edge, etc.) will display the label rather than
       * the value in the drop-down list if both are present, whereas webkit
       * browsers (Chrome and Safari) will display both, with the label to the
       * right and slightly faded. To ensure all users see the same info, We use
       * different labels for the different browser engines: */
      let optionLabel;
      if (logObjIsEmpty) {
        optionLabel = (isBrowserWebkit) ? "Empty" : `${logObjName} (Empty)`;
      } else {
        optionLabel = "";
      }

      let autoCompEntryEle = makeElement(
        "option",
        undefined,
        {
          value: logObjName,
          label: optionLabel
        }
      );
      autoCompleteItems.push(autoCompEntryEle);
    }
  }

  /* Make the textbox for inputting the name of the object you want to view: */
  let clearInputButton = makeElement(
    "button",
    "✖",
    {
      id: "crlr-input-clear",
      "data-for": "crlr-input-textbox"
    }
  );
  let autoCompleteList = makeElement(
    "datalist",
    autoCompleteItems,
    {
      id: "crlr-autocomplete-list"
    }
  );
  let inputTextBox = makeElement(
    "input",
    undefined,
    {
      id: "crlr-input-textbox",
      type: "text",
      value:"allLinks",
      list: "crlr-autocomplete-list",
      size: requiredLength
    }
  )
  let logObjInputContainer = makeElement(
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

  let altFormatCheckBox = makeElement(
    "input",
    undefined,
    {
      id: "crlr-data-alt-format-checkbox",
      type: "checkbox",
    }
  );
  let checkBoxLabel = makeElement(
    "label",
    "Show internal data format?",
    {
      for: "crlr-data-alt-format-checkbox"
    }
  );
  let inputRow = makeElement(
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
  let pre = makeElement("pre");
  let preCont = makeElement("div", pre, {class:"crlr-output"});
  let dlLinkPara = makeElement("p");

  appendChildren(
    modalContent,
    [inputRow, preCont, dlLinkPara]
  );

  function outputLogObjToModal(obj, dlName, objToString) {
    const MAX_OUTPUT_LENGTH = 5000;

    /* Main JSON Preview output: */
    let objJSON = objToString(obj);
    let objJSONPreview = objJSON;
    let previewTooLong = (objJSONPreview.length > MAX_OUTPUT_LENGTH);
    if (previewTooLong) {
      objJSONPreview = cutOff(objJSON, MAX_OUTPUT_LENGTH, "\n");
      objJSONPreview += "\n...";
    }
    pre.innerHTML = objJSONPreview;

    /* Prepare data for the download link and the text around it: */
    let beforeLinkText = "";
    let linkText = "";
    let afterLinkText = "";
    if (previewTooLong) {
      beforeLinkText = "Note that the data shown above is only a preview, as the full data was too long. ";
      linkText = "Click here";
      afterLinkText = " to download the full JSON file.";
    }
    else {
      linkText = "Download JSON";
    }

    let blob = new Blob([objJSON], {type: 'application/json'});
    let url = URL.createObjectURL(blob);

    let downloadName = window.location.hostname.replace(/^www\./i, "");
    downloadName += "_" + dlName;
    if (timedOut) downloadName += "_(INCOMPLETE)";
    downloadName +=".json";

    let dlLink = makeElement("a", linkText,
      {
        href: url,
        download: downloadName,
        class: "crlr-download"
      }
    );

    /* Remove any existing children of dlLinkPara so that we don't end up
     * repeatedly adding download messages to eachother: */
    while (dlLinkPara.firstChild !== null) {
      dlLinkPara.removeChild(dlLinkPara.firstChild);
    }
    appendChildren(dlLinkPara, [beforeLinkText, dlLink, afterLinkText]);
  }

  const outputEventFns = (function() {
    let currentObj;
    let currentObjName;
    let currentObjToString;

    /* Make functions: */
    function updateOutput() {
      let logObjName = inputTextBox.value;
      let newObjToOutput;
      let objToString;
      for (let i = 0, len = logObjMetaData.length; /*@noConditional*/; ++i) {
        /* If there is no logging object with a matching name in ANY group, just
         * return to avoid changing the interface: */
        if (i >= len) {
          return;
        }
        let logObjGroupData = logObjMetaData[i];
        let group = logObjGroupData.logObjects;
        if (group.hasOwnProperty(logObjName)) {
          currentObj         = newObjToOutput = group[logObjName];
          currentObjToString = objToString    = logObjGroupData.toString;
          break;
        }
      }
      currentObjName = logObjName;
      if (!altFormatCheckBox.checked) {
        newObjToOutput = loggingObjectReformat(newObjToOutput);
      }
      outputLogObjToModal(newObjToOutput, logObjName, objToString);
    }
    function changeFormat() {
      if (!currentObj) {
        return;
      }
      let newObjToOutput = currentObj;
      if (!altFormatCheckBox.checked) {
        newObjToOutput = loggingObjectReformat(newObjToOutput);
      }
      outputLogObjToModal(newObjToOutput, currentObjName, currentObjToString);
    }
    /* Return object containing functions: */
    return {
      updateOutput,
      changeFormat
    }
  })();//Close closure

  /* Call the function immediately so that the default object (e.g. allLinks)
   * is displayed immediately: */
  outputEventFns.updateOutput();
  inputTextBox.addEventListener("input", outputEventFns.updateOutput);
  altFormatCheckBox.addEventListener("change", outputEventFns.changeFormat);

  const endTime = performance.now();
  let runningTime = Math.round((endTime - startTime)/10)/100;
  let timeInfoEle = makeElement("p","(Crawling took " + runningTime + " seconds)",
      {id:"crlr-time"}
  );
  modalHeaderMsg.appendChild(timeInfoEle);

  document.body.insertBefore(modal, document.body.childNodes[0]);
}

/**
 * Robots.txt-related functions:
 */
function parseRobotsTxt(robotsTxt) {
  let disallowed = [];
  let allowed = [];
  let sitemap = [];

  let lines = robotsTxt.split(/[\n\r]/);

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
      let vals = [line.substring(0, splitPoint), undefined];
      vals[1] = line.substring(splitPoint + 1);
      return vals;
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
    /* Skip the remaining section until a matching user-agent directive is found: */
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
  let pendRet = {
    Allow: allowed,
    Disallow: disallowed,
    Sitemap: sitemap
  }
  return pendRet;
}

function matchesPattern(str, basePattern) {
  let parsedPattern = basePattern;
  /* If a pattern ends in "$", the string must end with the pattern to match:
   *
   * E.G. "/*.php$" will match "/files/documents/letter.php" but
   * won't match "/files/my.php.data/settings.txt". */
  const REQUIRE_END_WITH_PATTERN = (parsedPattern.charAt(parsedPattern.length-1) === "$");
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
  /* If we reached the end of the string without finishing the pattern, it's not
   * a match: */
  return false;
}

function isPageCrawlable(fullUrl) {
  const DOMAIN = window.location.origin;
  if (DOMAIN !== fullUrl.substr(0, DOMAIN.length)) {
    throw new Error("URL " + fullUrl + " is not within the same domain!");
  }
  /* The path portion of the fullURL. That is, the part
   * following the ".com" or ".net" or ".edu" or whatever.
   *
   * For example, on a site's homepage, the path is "/", and
   * on an faq page, it might be "/faq.html" */
  let pagePath = fullUrl.substr(DOMAIN.length);

  /* Allow statements supersede disallow statements, so we can
   * check the allowed list first and shortcut to true if we
   * find a match: */
  for (let i = 0, len = robotsTxtData.Allow.length; i < len; ++i) {
    let pattern = robotsTxtData.Allow[i]
    if (matchesPattern(pagePath, pattern)) return true;
  }
  for (let i = 0, len = robotsTxtData.Disallow.length; i < len; ++i) {
    let pattern = robotsTxtData.Disallow[i]
    if (matchesPattern(pagePath, pattern)) return false;
  }
  /* If this page is on neither the allowed nor disallowed
   * list, then we can assume it's allowed: */
  return true;
}

/**
 * CRAWLING STARTS HERE:
 */
(function loadRobotsTxtAndBeginCrawl() {
  let httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function() {
    if (httpRequest.readyState === XMLHttpRequest.DONE) {
      if (httpRequest.status === 200) { //Code for "Good"
        /* If the site has a robots.txt file, parse it so the data can be
         * used to determine if a page should be crawled: */
        window.robotsTxtData = parseRobotsTxt(httpRequest.responseText);
      } else {
        /* If the site does NOT have a robots.txt file, assume all pages are
         * allowed to be crawled: */
        window.isPageCrawlable = function () {return true};
      }

      let anchorlessURL = urlRemoveAnchor(window.location);

      /* Start the crawl: */
      classifyImages(document, anchorlessURL);
      let initialPageLinks = classifyLinks(document, anchorlessURL);

      /* Here we create a spoof (not actually in the page/site) link to avoid
       * making the visited data structure irregular: */
      let startPageSpoofLink = makeElement(
        "a",
        "(Initial page for crawler script)",
        {href: "(Initial page for crawler script)"}
      )
      visited[anchorlessURL] = [{[anchorlessURL]: startPageSpoofLink}];

      visitLinks(anchorlessURL, initialPageLinks);
    }
  }
  httpRequest.open("GET", "/robots.txt");
  httpRequest.send();
})();
