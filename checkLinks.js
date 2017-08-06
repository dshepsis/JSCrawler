/* @incomplete The script won't create any output if no requests are made, i.e.
 * the page contains no internal links */

 /* @incomplete Add support for no robots.txt file (i.e. 404 error) */

 /* @incomplete Use HTTP Response Header data to terminate the loading of
  * non-page files early. */

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
'use strict';

/* Settings variables: */
const RECOGNIZED_FILE_TYPES = ["doc", "docx", "gif", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "xls", "xlsx"];

const BANNED_STRINGS = ["drupaldev"];
function containsBannedString(href) {
  for (let i = 0, len = BANNED_STRINGS.length; i < len; ++i) {
    let badStr = BANNED_STRINGS[i];
    if (href.indexOf(badStr) !== -1) return badStr;
  }
  return false;
}

const MAX_TIMEOUT = 2*1000; //60,000 Miliseconds, or 1 minute
let timedOut = false;
let allRequests = [];
// let timer = window.setTimeout(()=>{
//     timedOut = true;
//     for (let r = 0, len = allRequests.length; r < len; ++r) {
//       let request = allRequests[r];
//       request.recordedByTimeout = true;
//       if (request.readyState === 4 && !request.callbackComplete) request.callbackFailed = true;
//       if (request.readyState === 4) continue;
//       request.readyStateBeforeAbort = request.readyState;
//       request.abort();
//       request.aborted = true;
//       console.log("Aborting request " + r + " out of " + len);
//     }
//   }, MAX_TIMEOUT);

/* Script relevant: */
let visited = {};
let allLinks = {};

let robotsDisallowed = {};
let redirects = {};
let notFound = {};
let forbidden = {};
let accessDenied = {};
let bannedStrings = {};
let files = {};
let localFiles = {};
let badScheme = {};
let ipAddresses = {};

/* Collecting them for reference */
let loggingObjects = {visited, allLinks, robotsDisallowed, redirects, notFound, forbidden, accessDenied, bannedStrings, files, localFiles, badScheme, ipAddresses};

/* Function definitions: */

/* Makes a box appear on the user interface with a counter showing
 * the number of live (unresolved) http requests currently waiting: */
const requestCounter = function() {
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
}();

/* Check all of the local links on a given page, and make requests to
 * get the coresponding HTML documents so they can also be analyzed for
 * links. This is done recursively until all internal links have been
 * marked as visited. This effectively forms a map of the site as reachable
 * by a user simply links from the page at which the script is run */
function visitLinks(curPage, linkObj) {
  if (timedOut) {
    throw new Error("***REACHED MAX TIMEOUT OF " + MAX_TIMEOUT + "ms BEFORE FINISHING CRAWL.***");
    window.alert("Sorry, the crawl took longer than the maximum timeout of " + Math.round(MAX_TIMEOUT/100)/10 + " seconds. All operations were cancelled.");
  }

  let foundNewPage = false;
  console.log("Checking links found on: " + curPage)
  for (let url in linkObj) {
    /* Note: this version is slightly different to the one found in classifyLinks,
     * as it uses linkObj which is already filled out by classifyLinks. */
    function recordLinkTo(...loggingObjects) {
      let linkData = linkObj[url];
      for (let i = 0, len = loggingObjects.length; i < len; ++i) {
        let obj = loggingObjects[i];
        if (obj[url] !== undefined) obj[url].push(linkData);
        else obj[url] = [linkData];
      }
    }

    if (redirects[url] !== undefined) {
      recordLinkTo(redirects);
      continue;
    }
    /* Do not re-analyze a page we have already visited: */
    if (visited[url] !== undefined) {
      recordLinkTo(visited);
      continue;
    }
    /* Mark this page as having been "visited" or checked for links. This is done
     * as soon as possible to mitigate the chances of a race condition where a page
     * is checked twice, which is possible due to this code being asynchronous. */
    visited[url] = [curPage];
    foundNewPage = true;

    /* This function takes 3 parameters (in order):
     *
     * - A callback function for handling normal responses
     * - The URL of the page to to request
     * - A callback function for handling errors
     *
     * The error handler is optional, but we pass one so that we can distinguish
     * between different kinds of errors.
     *
     * For example, a request may fail if the server returns a 404
     * (file not found) or if the link redirects to an external
     * location, which would violate the common-origin policy. */
    requestCounter.increment();
    let req = HTMLDocLoader (url,
      function normalResponseHandler (page, details) {
        /* Checks if the request resolved to a file rather than an HTML document: */
        let extension = findURLExtension(details.responseURL)
        let isFile = (RECOGNIZED_FILE_TYPES.indexOf(extension) !== -1);
        if (isFile) {
          console.warn("Found " + extension + " file at: " + url + "\n\tLinked-to from: " + curPage);
          recordLinkTo(files);
          return;
        }
        if (page === null) {
          console.error("Null response from " + url + ". It may be an unrecognizes file type.\n\tIt was linked-to from " + curPage);
          console.error(details);
          return;
        }

        /* Recursively check the links found on the given page: */
        let newLinks = classifyLinks(page, url,  true);
        //visitLinks(url, newLinks);@debug
      }, //Close normal-respone-handler callback-function,
      function errorHandler (details) {
        if (details.readyState !== 4) {
          console.error("AN UNIDENTIFIED READYSTATE ERROR OCURRED!", details);

        }
        let msg = "";
        switch (details.status) {
          case 0:
            recordLinkTo(redirects);
            msg = "The request to " + url + " caused an undefined error. The url robably either redirects to an external site. or is invalid. There may also be a networking issue, or another problem entirely.";
            msg += "\nUnfortunately, this script cannot distinguish between those possibilities.";
            msg += "\n\tLinked-to from " + curPage;
            break;
          case 401:
            recordLinkTo(accessDenied);
            msg = "A 401 Error occurred when requesting " + url + ". That means access was denied to the client by the server.";
            msg += "\n\tLinked-to from: " + curPage;
            break;
          case 403:
            recordLinkTo(forbidden);
            msg = "A 403 Error occurred when requesting " + url + ". That means the server considers access to the resource absolutely forbidden.";
            msg += "\n\tLinked-to from: " + curPage;
            break;
          case 404:
            recordLinkTo(notFound);
            msg = "A 404 Error occurred when requesting " + url + ". That means the server could not find the given page.";
            msg += "\n\tLinked-to from: " + curPage;
            break;
          detault:
            console.error("AN UNIDENTIFIED ERROR OCURRED!", details);
        }
        if (msg !== "") console.error(msg);
      }, //Close error-handler callback-function
      /* This function will execute whenever a document request fully resolves,
       * regardless of whether it was successful or not.
       *
       * By incrementing the instances counter before a request is made (aove
       * this method call) and decrementing it when a request completes, we can
       * execute code exactly when crawling is fully complete, by checking when
       * the total number of unresolved requests reaches 0.
       */
      function onComplete (xhr) {
        xhr.callbackComplete = true;
        requestCounter.decrement();
        if (requestCounter.count === 0) {
          requestCounter.setText("All requests complete!");
          presentResults();
        }
      }
    ); //Close call to HTMLDocLoader
    allRequests.push(req);
  } //Close for loop iterating over links
} //Close function visitLinks

function findURLExtension(url) {
  for (let i = url.length - 1; i >= 0; --i) {
    if (url.charAt(i) === ".") return url.substring(i+1).toLowerCase();
  }
  return undefined;
}

/* @incomplete Log null links somehow (should I?) */
function classifyLinks(doc, curPageURL, quiet) {
  /* Default "quiet" to false. That is, by default, this function prints A LOT
   * of stuff to console. */
  if (quiet === undefined) quiet = false;

  const LINKS = doc.getElementsByTagName("a");
  const DOMAIN = window.location.origin.toLowerCase();

  /* Contains the URLs of all of the local (same-domain) pages linked to from
   * this page: */
  let localLinksFromThisPage = {};

  /* Loop over links: */
  for (let i = 0, len = LINKS.length; i < len; ++i) {
    let link = LINKS[i];
    let href = link.getAttribute("href");
    /* Handle links with no HREF attribute, such as anchors or those used as
     * buttons: */
    if (href === null) {
      link.style.border = "2px solid orange";
      link.title = (link.title) ? link.title + "\nNull link" : "Null link";
      continue;
    }
    href = href.toLowerCase();
    /* Protocol-relative link correction: */
    if (href.substr(0,2) == "//") {
      let curPageProtocol = /^(\w+?:)\/\//i.exec(curPageURL)[1];
      href = curPageProtocol + href;
    }

    /* Function for adding data about a link to data-logging objects: */
    function recordLinkTo(...loggingObjects) {
      let linkData = {};
      linkData[curPageURL] = href;
      for (let i = 0, len = loggingObjects.length; i < len; ++i) {
        let obj = loggingObjects[i];
        if (obj[link.href] !== undefined) obj[link.href].push(linkData);
        else obj[link.href] = [linkData];
      }
    }
    /* All non-null links are recorded to the allLinks object: */
    recordLinkTo(allLinks);

    /* If the link contains a banned string, record it: */
    if (containsBannedString(href)) {
      let bannedStr = recordLinkTo(bannedStrings);

      console.error("Found link " + href+ " containing a banned string: " + bannedStr + ".\n\tLinked-to from: " + curPageURL);
      link.style.border = "4px dashed red";
      link.title = (link.title) ? link.title + "\nBANNED WORD LINK" : "BANNED WORD LINK";
      /* Don't parse the link if it is banned. This avoids the link
       * being crawled. */
      continue;
    }

    /* PARSING LINK TYPES: */
    /* Absolute internal link: */
    if (href.substr(0, DOMAIN.length) === DOMAIN) {
      if (isPageCrawlable(link.href)) {
        recordLinkTo(localLinksFromThisPage);
      } else {
        recordLinkTo(robotsDisallowed);
        link.style.color = "orange"
        link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
      }

      if (!quiet) {
        console.log(link);
        console.log(i + ":Absolute Internal:\t" + href);
      }
    }
    /* Absolute external link: */
    else if (/^https?:\/\//i.test(href)) {
      /* If the link contains a string which resembles an IP address: */
      if (/(?:\d{1,3}\.){3}\d{1,3}/.test(href)) {
        recordLinkTo(ipAddresses);
      }

      link.style.border = "2px dotted gray";
      link.title = (link.title) ? link.title + "\nAbsolute external link" : "Absolute external link";
    }
    /* Special Link types: */
    else {
      /* If there is a colon before the first forward slash, or a colon
       * without any forward slash, the link is probably specifying some
       * scheme besides http (such as file: or internal:) which is almost
       * definitely invalid. */
      let colonIndex = href.indexOf(":");
      let slashIndex = href.indexOf("/");
      if (colonIndex !== -1
          && (slashIndex === -1 || colonIndex < slashIndex)) {
        recordLinkTo(badScheme);
      }
      /* Anchor Link: */
      else if (href.substr(0,1) === "#") {
        link.style.border = "2px solid pink";
        link.title = (link.title) ? link.title + "\nAnchor link" : "Anchor link";
      }
      /* Email link: */
      else if (href.substr(0,6) === "mailto") {
        link.style.border = "2px solid yellow";
        link.title = (link.title) ? link.title + "\nEmail link" : "Email link";
      }
      /* File link: */
      else if (href.substr(0,4) === "file") {
        recordLinkTo(localFiles);

        link.style.border = "2px dashed blue";
        link.title = (link.title) ? link.title + "\nFile link" : "File link";
      }
      /* Site-Root-Relative Link: */
      else if (href.substr(0,1) === "/") {
        if (isPageCrawlable(link.href)) {
          recordLinkTo(localLinksFromThisPage);
        } else {
          recordLinkTo(robotsDisallowed);
          link.style.color = "orange"
          link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
        }

        if (!quiet) {
          console.log(link);
          console.log(i + ":Root Relative:\t" + href);
        }
      }
      /* Page-Relative and other links: */
      else {
        if (isPageCrawlable(link.href)) {
          recordLinkTo(localLinksFromThisPage);
        } else {
          recordLinkTo(robotsDisallowed);
          link.style.color = "orange"
          link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
        }

        if (!quiet) {
          console.log(link);
          console.log(i + ":Page Relative(?):\t" + href);
        }
      }
    } //Close section for parsing non-absolute links
  } //Close for loop iterating over link elements
  return localLinksFromThisPage;
}

/* ROBOTS.TXT PARSING: */
/**
 * General purpose asynchronous loading function.
 *
 * NOTE: This isn't really meant to be used on its own. Instead, I make other
 *     functions for each specific application (e.g. text loading, document
 *     loading, etc.) and write functions which serve to partially-apply arguments
 *     to AJAXLoader. See below for examples.
 *
 * @param {string} requestURL - The url of the request to be made. It may be
 *     relative or absolute.
 * @param {function} onGoodResponse - A callback for handling the httpRequest
 *     when the request is complete and valid (i.e. its readyState is DONE and
 *     its status is 200).
 * @param {*} [onError] - Used for handling of errors. Behavior depends on type:
 *     If onError is missing or undefined, a standard error will be thrown.
 *     If it is null, no error will be thrown (except by the browser itself) and
 *       the request will fail silently.
 *     If it is a function, it will be executed with the httpRequest object as
 *       its parameter.
 *     If it is of any other type, it will be printed as an error message using
 *       console.error.
 * @param {*} [onComplete] - Handles any remaining tasks after a request has been
 * completed. Behavior depends on type:
 *     If it is a function, it will be called as the last piece of code in a
 *       request. This occurs regardless of whether an error is called, and
 *       always happens after onGoodResponse and onError.
 *     If it is undefined, nothing will happen after onGoodResponse or onError.
 *     If it is of any other type, it will be printed using console.log (again,
 *       after onGoodResponse and onError).
 * @param {string} [responseType] - Sets the responseType property of the
 *     httpRequest object before it is sent. Valid values include "text", "json"
 *     "document" and "blob". This doesn't affect the parameters of the above 3
 *     callback functions, but it does affect how the response is parsed.
 *     If this parameter is omitted or set to undefined, no responseType will be
 *     set. This causes equivalent behavior to setting responseType to "text".
 */
function AJAXLoader(requestURL, onGoodResponse, onError, onComplete, responseType) {
  let httpRequest = new XMLHttpRequest();
  httpRequest.readyStateHistory = [];
  httpRequest.readyStateHistory.push(httpRequest.readyState);
  httpRequest.onreadystatechange = function() {
    httpRequest.readyStateHistory.push(httpRequest.readyState);
    if (httpRequest.readyState === XMLHttpRequest.DONE) {
      if (httpRequest.status === 200) { //Code for "Good"
        onGoodResponse(httpRequest);
      } else {
        /* onError is optional, but we should still emit an error if it's absent: */
        if (onError === undefined) {
          throw new Error("XHR Error: " + httpRequest.status);
        }
        /* If onError is a function, allow it to handle the error: */
        else if (typeof onError === 'function') {
          onError(httpRequest);
        }
        /* If onError is null, it must have been explicitly to null, defining
         * a deliberate lack of an error handler. In that case, fail silently.
         *
         * Otherwise, just print onError to console as an error message: */
        else if (onError !== null) {
          console.error(onError);
        }
      }
      /* onComplete is optional. If it is a function, execute it: */
      if (typeof onComplete === 'function') {
        onComplete(httpRequest);
      }
      /* ...Otherwise, just print it. This mainly assumes onComplete is a string,
       * bt it could be anything: */
      else if (onComplete !== undefined) console.log(onComplete);
    }
  }
  httpRequest.givenURL = requestURL; //@debug
  httpRequest.open("GET", requestURL);
  if (responseType !== undefined) httpRequest.responseType = responseType;
  httpRequest.send();
  httpRequest.sent = true;
  return httpRequest;
}
/* Partially-applied version of the general-purpose loading function
 * AJAXLoader to be specific to HTML documents: */
function HTMLDocLoader(pageURL, responseCallBack, errorHandler, onComplete) {
  return AJAXLoader(pageURL,
    function onGoodResponse(httpRequest) {
      responseCallBack(httpRequest.responseXML, httpRequest);
    },
    function onError(httpRequest) {
      if (errorHandler === undefined) {
        console.error("AJAX attempt failed while requesting a document at " + pageURL, "Error code: " + httpRequest.status + "\n", httpRequest);
      } else errorHandler(httpRequest);
    },
    onComplete,
    "document"
  );
}
/* Partially applied version of AJAXLoader specialized for loading files
 * as plain-text. */
function textLoader(fileURL, responseCallBack, errorHandler, onComplete) {
  return AJAXLoader(fileURL,
    function onGoodResponse(httpRequest) {
      responseCallBack(httpRequest.responseText);
    },
    errorHandler,
    onComplete,
  );
}

function parseRobotsTxt(robotsTxt) {
  let disallowed = [];
  let allowed = [];
  let sitemap = [];

  let lines = robotsTxt.split(/[\n\r]/);

  /* Do allow/disallow statements in this block apply to us? I.e. are they
   * preceded by a user-agent statement which matches us? */
  let validUserAgentSection = true;
  for (let i = 0, len = lines.length; i < len; ++i) {
    let line = lines[i].trim();

    /* Skip empty and comment lines: */
    if (line.length === 0 || line.charAt(0) === "#") continue;

    /* Check for sitemaps before checking the user agent so that they are always
     * visible to us: */
    else if (/^sitemap: /i.test(line)) {
      const SITEMAP_LEN = 9;
      sitemap.push(line.substr(SITEMAP_LEN));
    }

    /* Make sure the user agent matches this crawler: */
    else if (/^user-agent: /i.test(line)) {
      const USER_AGENT_LENGTH = 12;
      validUserAgentSection = (line.substr(USER_AGENT_LENGTH) === "*");
    }
    /* Skip the remaining section until a matching user-agent directive is found: */
    else if (!validUserAgentSection) continue;

    /* If the line is a disallow clause, add the pattern to the array of
     * disallowed patterns: */
    else if (/^disallow: /i.test(line)) {
      const DISALLOW_LEN = 10;
      disallowed.push(line.substr(DISALLOW_LEN));
    }

    /* If the line is an allow clause, add the pattern to the array of
     * allowed patterns: */
    else if (/^allow: /i.test(line)) {
      const ALLOW_LEN = 7;
      allowed.push(line.substr(ALLOW_LEN));
    }

    /* An empty disallow string is considered equal to a global allow. */
    else if (/^disallow:$/i.test(line)) {
      allowed.push("/");
    }
    else console.error('Don\'t understand: "' + line + '" ' + line.length);
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
  /* If a pattern ends in "$", the string must with the pattern to pass:
   *
   * E.G. "/*.php" will match "/files/documents/letter.php" but
   * won't match "/files/my.php.data/settings.txt". */
  const REQUIRE_END_WITH_PATTERN = (parsedPattern.charAt(parsedPattern.length-1) === "$");
  if (REQUIRE_END_WITH_PATTERN){
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
textLoader("/robots.txt",
  function fileIsPresent(fileText) {
    window.robotsTxtData = parseRobotsTxt(fileText)
  },
  function fileIsMissing() {
    /* If there is no robots.txt file, assume all pages are allowed: */
    window.isPageCrawlable = function () {return true};
  },
  function regardless() {
    let initialPageLinks = classifyLinks(document, window.location.href);
    visited[window.location.href] = [true];

    visitLinks(window.location.href, initialPageLinks);
  }
);

/**
 * Code for presenting results to the user when crawling is done:
 */

/**
 * Code for presenting results to the user when crawling is done:
 */

/**
 * Makes an HTML element with content. This is similar to the
 * document.createElement() method, but allows text or other elements to be
 * added as children in-place. The optional attrObj parameter allows for
 * attributes such as id, class, src, and href to also be specified in-place.
 *
 * For example:
 * > makeElement("p", "Hello world!");
 * <p>Hello world!</p>
 *
 * > makeElement("span", 3.14);
 * <span>3.14</span>
 *
 * > makeElement("a", "FAQ", {href:"/faq.html"})
 * <a href="/faq.html">FAQ</a>
 *
 * The equivalent using default tools is much longer, and takes at least 2 lines:
 * > var ele = document.createElement("p");
 * > ele.appendChild(document.createTextNode("Hello world!"));
 *
 * makeElement be used without specifying the content parameter, in which case
 * it becomes equivalent to document.createElement.
 *
 * More importantly, the content attribute can be another HTMLElement, in which
 * case the element is appended directly to the newly created element.
 *
 * For example,
 * > var item = makeElement("li", "Get eggs");
 * > makeElement("ul", item)
 * <ul><li>Get eggs</li></p>
 *
 * You can even chain the methods together directly, without intermediate
 * variables:
 * > makeElement("ul", makeElement("li", "Get milk"));
 * <ul><li>Get milk</li></p>
 *
 * If content is an array, then each item will be individually appended using
 * the same logic as for a single piece of content:
 *
 * > let ingredients = ["Milk", "Eggs", "Flour"];
 * > let eles = ingredients.map((ingredient)=>makeElement("li", ingredient));
 * > makeElement("ul", eles);
 * <ul><li>Milk</li><li>Eggs</li><li>Flour</li></ul>
 */
function makeElement (type, content, attrObj) {
  /* The new element being populated: */
  var newEle = document.createElement(type);

  /* Inner function for appending children to newEle: */
  function appendItem(item) {
    if (item instanceof HTMLElement) {
     newEle.appendChild(item);
    }
    /* Otherwise, coerce item into a string and make a text node out of it.
    * Then, append that text node to newEle: */
    else {
     var text = document.createTextNode(String(item));
     newEle.appendChild(text);
    }
  }

  /* If no content parameter was passed, leave the element childless:
  *
  * NOTE: This function is basically equivalent to document.createElement()
  * if you use this feature. It's only here for code consistency should you
  * need to create both childed and childless elements */
  if (content === undefined) {
    /* Make no changes */
  }
  /* If the content parameter was an array, iterate through and add each item
   * as a child to newEle: */
  else if (Array.isArray(content)) {
    for (let i = 0, len = content.length; i < len; ++i) {
      appendItem(content[i]);
    }
  }
  /* If content is just a single item, simply append it on its own to newEle */
  else appendItem(content);

  /* Apply information from the attributes object: */
  if (attrObj !== undefined) {
   for (let attribute in attrObj) {
     newEle.setAttribute(attribute, attrObj[attribute]);
   }
  }

  return newEle;
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
  a:visited { /* Visited */
    color: #551a8b
  }

  /* mouse over link */
  a:hover {
    color: darkred;
  }

  /* selected link */
  a:active {
    color: red;
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
    opacity: 0.2;
    transition: opacity .2s;

    color: #222;
    box-shadow: 2px 2px 6px 1px rgba(0, 0, 0, 0.4);

    display: flex;
    flex-direction: column;
  }
  #crlr-modal:hover {
    opacity: 1;
  }

  #crlr-modal #crlr-min {
    border: 1px solid gray;
    padding: 0.5em;
    border-radius: 5px;
    margin-right: 1em;
    background-color: rgba(0,0,20,0.1);
  }
  #crlr-modal #crlr-min:hover {
    border-color: blue;
    background-color: rgba(0,0,20,0.2);
  }

  #crlr-modal #crlr-header {
    display: flex;
    align-items: flex-end;

    padding: 0.5em;
    border-bottom: 1px dotted #808080;
    width: 100%;
    background-color: #e1e1ea;
  }
  #crlr-modal #crlr-header > * {
    margin-top: 0;
    margin-bottom: 0;
    margin-right: 16px;
  }
  #crlr-modal #crlr-header > *:last-child {
    margin-right: 0;
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
  /* ...Then re-appear the headeer element, which contains the button, so that
   * the button doesn't get hidden: */
  #crlr-modal.minimized #crlr-header {
    display: flex;
    margin: 0;
    border: none;
  }
  #crlr-modal.minimized {
    display: table;
    background-color: #e1e1ea;
  }
  #crlr-modal.minimized #crlr-min {
    margin: 0;
  }
  #crlr-modal .crlr-output > pre {
    max-height: 200px;
    padding: 0.5em;
    overflow: auto;
    border: 1px dashed gray;
    background-color: #e1e1ea;
  }
  #crlr-modal .crlr-output {
    display: flex;
    max-width: 100%;
  }`;

  let styleEle = makeElement("style", myCSS, {title:"crlr.js.css"});
  document.head.appendChild(styleEle);
  window.crlrCSS = styleEle.sheet;
  if (crlrCSS.title !== "crlr.js.css") console.error("Someone stole our stylesheet!");

  /* Create modal for showing results: */
  const modal = makeElement("div", undefined, {id: "crlr-modal"});

  /* Create button for minimizing modal so that the site can be used normally: */
  const minimizeButton = makeElement("button", "🗕", {id: "crlr-min"});

  minimizeButton.type = "button";
  /* Make the button toggle other content in the modal to/from display: none:
   * (using a closure to make the toggle var private) */
  minimizeButton.onclick = () => modal.classList.toggle("minimized");
  modal.appendChild(minimizeButton);


  const modalTitle = makeElement("h1", "Results: ", {id:"crlr-title"})
  const modalHeader = makeElement("header", [minimizeButton,modalTitle],
      {id:"crlr-header"}
  );
  modal.appendChild(modalHeader);

  const modalContent = makeElement("div", undefined, {id:"crlr-content"});
  modal.appendChild(modalContent);

  modalContent.appendChild(makeElement("p", "All links: "));


  let allLinksJSON = JSON.stringify(allLinks, null, 2);
  /* Put objects which only have one key:value pair on a single line, rather
   * than putting the opening bracket and closing bracket on separate lines: */
  allLinksJSON = allLinksJSON.replace(
      /(^[^\S\r\n]*\{)[^\S\r\n]*$[\r\n]*^\s*([^\r\n}]+$)[\r\n]*^\s*(\})/gm,
      "$1$2$3"
  );
  /* Cuts the parameter string off at the given number of characters. If the
   * parameter string is already shorter than maxLen, it is returned  without
   * modification.
   *
   * Optionally, you may specify a break-string at which the string will be cut.
   * If you do, the string will be cut just before the last instance of breakStr
   * before the cutoff-point. If no instance can be found, an empty string is
   * returned. */
  function cutOff(str, maxLen, breakStr) {
    let cutOff = maxLen;
    /* If the string is already shorter than maxLen: */
    if (cutOff > str.length) return str;
    /* If not break-string is given, cutOff right on the character: */
    if (breakStr === undefined) return str.substring(0, cutOff);

    cutOff = str.lastIndexOf(breakStr, cutOff);
    /* If the breakStr character can't be found, return an empty string: */
    if (cutOff === -1) return "";
    return str.substring(0, cutOff);
  }

  let reducedAllLinks = cutOff(allLinksJSON, 2000, "\n");

  let pre = makeElement("pre", reducedAllLinks + "\n...");

  var blob = new Blob([allLinksJSON], {type: 'application/json'});
  var url = URL.createObjectURL(blob);

  let preCont = makeElement("div", pre, {class:"crlr-output"});

  modalContent.appendChild(preCont);
  let dlLink = makeElement("a", "Download full JSON",
    {
      href: url,
      download: window.location.hostname.replace(/^www\./i, "") + "_allLinks.json",
      class: "crlr-download"
    }
  );
  modalContent.appendChild(makeElement("p", dlLink));

  document.body.insertBefore(modal, document.body.childNodes[0]);
}
