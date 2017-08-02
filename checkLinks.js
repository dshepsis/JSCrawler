/* @incomplete The script won't create any output if no requests are made, i.e.
 * the page contains no internal links */

 /* @incomplete Add support for no robots.txt file (i.e. 404 error) */


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

const MAX_TIMEOUT = 60*1000; //60,000 Miliseconds, or 1 minute
let timedOut = false;
let timer = window.setTimeout(()=>timedOut = true, MAX_TIMEOUT);

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
    display: disp,
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
    HTMLDocLoader (url,
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
        visitLinks(url, newLinks);
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
      function onComplete () {
        requestCounter.decrement();
        if (requestCounter.count === 0) {
          requestCounter.setText("All requests complete!");
          presentResults();
        }
      }
    ); //Close call to HTMLDocLoader
  } //Close for loop iterating over links
} //Close function visitLinks

function findURLExtension(url) {
  for (let i = url.length - 1; i >= 0; --i) {
    if (url.charAt(i) === ".") return url.substring(i+1).toLowerCase();
  }
  return undefined;
}

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
      if (/(?:\d{1,3}\.){3}\d{1,3}/i.test(href)) {
        recordLinkTo(ipAddresses);
      }

      link.style.border = "2px dotted gray";
      link.title = (link.title) ? link.title + "\nAbsolute external link" : "Absolute external link";
    }
    /* Special Link types: */
    else {
      /* If there is a colon before the first forward slash, the link
       * is specifying some scheme besides http (such as file: or
       * internal:) which is almost definitely invalid. */
      let colonIndex = href.indexOf(":");
      if ((colonIndex !== -1) && (colonIndex < href.indexOf("/"))) {
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
  httpRequest.onreadystatechange = function() {
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
  httpRequest.open("GET", requestURL);
  if (responseType !== undefined) httpRequest.responseType = responseType;
  httpRequest.send();
}
/* Partially-applied version of the general-purpose loading function
 * AJAXLoader to be specific to HTML documents: */
function HTMLDocLoader(pageURL, responseCallBack, errorHandler, onComplete) {
  AJAXLoader(pageURL,
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
  AJAXLoader(fileURL,
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

/* Run Script: */
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

function setStyle(element, styleObj) {
  for (property in styleObj) {
    element.style[property] = styleObj[property]
  }
}

/* This is called when the crawling is fully complete. it is the last
 * part of the script ot be executed: */
function presentResults() {
  /* Remove the counter now that requests are finished */
  requestCounter.display.remove();
  const modal = document.createElement("div");
  let text = document.createTextNode("Hello world!");
  modal.appendChild(text);
  setStyle(modal, {
    padding: "2em",
    border: "5px solid blue",
    borderRadius: "1em",
    backgroundColor: "white",
    position: "fixed",
    zIndex: "99999999999999",
    top: "2em",
    left: "2em",
    height: "calc(100% - 4em)",
    width: "calc(100% - 4em)",
    margin: "0",
    display: "block",
    opacity: "1",
    transition: "opacity .2s"
  });
  modal.onmouseenter = ()=>modal.style.opacity = "0";
  modal.onmouseleave = ()=>modal.style.opacity = "1";
  document.body.insertBefore(modal, document.body.childNodes[0]);
}
