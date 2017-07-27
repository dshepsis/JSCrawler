/* @incomplete The script won't create any output if no requests are made, i.e.
 * the page contains no internal links */

/* Quit out if we are in admin mode: */
const QUIT_ELEMENTS = ["#admin-menu", "#log-out", "#log-out-button", "#edit"];
for (let i = 0, len = QUIT_ELEMENTS.length; i < len; ++i) {
  let ele = document.querySelector(QUIT_ELEMENTS[i])
  if (ele !== null) {
    window.alert("ERROR: FOUND TERMINATING ELEMENT.\n\nCheck console for details");
    let tag = ele.innerHTML ? ele.outerHTML.slice(0,ele.outerHTML.indexOf(ele.innerHTML)) : ele.outerHTML;
    throw new Error("FOUND TERMINATING ELEMENT:\t" + tag);
  }
}

/* Settings variables: */
const RECOGNIZED_FILE_TYPES = ["doc", "docx", "gif", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "xls", "xlsx"];

const BANNED_STRINGS = ["drupaldev"];
function containsBannedString(href) {
  for (var i = 0, len = BANNED_STRINGS.length; i < len; ++i) {
    let badStr = BANNED_STRINGS[i];
    if (href.indexOf(badStr) !== -1) return badStr;
    return false;
  }
}

const MAX_TIMEOUT = 60*1000; //60,000 Miliseconds, or 1 minute
let timedOut = false;
let timer = window.setTimeout(()=>timedOut = true, MAX_TIMEOUT);

/* Script relevant: */
var visited = {};
var allLinks = {};
var redirects = {};
var notFound = {};
var forbidden = {};
var accessDenied = {};
var bannedStrings = {};
var files = {};

/* Function definitions: */

/* Makes a box appear on the user interface with a counter showing
 * the number of live (unresolved) http requests currently waiting: */
const requestCounter = function() {
  /* Counter variable: */
  console.log("safe");

  /* Create display: */
  const disp = document.createElement("p");
  var text = document.createTextNode("0");
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
    if (redirects[url] !== undefined) {
      redirects[url].push(curPage)
      continue;
    }
    /* Do not re-analyze a page we have already visited: */
    if (visited[url] !== undefined) {
      visited[url].push(curPage)
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
          if (files[url] === undefined) {
            files[url] = [curPage];
          } else {
            files[url].push(curPage)
          }
          return;
        }
        if (page === null) {
          console.error("Null response from " + url + ". It may be an unrecognizes file type.\n\tIt was linked-to from " + curPage);
          console.error(details);
          return;
        }

        /* Recursively check the links found on the given page: */
        var newLinks = classifyLinks(page, window.location.origin.toLowerCase(), url,  true);
        visitLinks(url, newLinks);
      }, //Close normal-respone-handler callback-function,
      function errorHandler (details) {
        if (details.readyState === 4 && details.status === 0) {
          let msg = "The request to " + url + " caused an undefined error. The url robably either redirects to an external site. or is invalid. There may also be a networking issue, or another problem entirely.";
          msg += "\nUnfortunately, this script cannot distinguish between those possibilities.";
          msg += "\n\tLinked-to from " + curPage;
          if (redirects[url] === undefined) {
            redirects[url] = [curPage];
          } else {
            redirects[url].push(curPage)
          }
          console.error(msg);
        } else if (details.readyState === 4 && details.status === 404) {
          if (notFound[url] === undefined) {
            notFound[url] = [curPage];
          } else {
            notFound[url].push(curPage)
          }
          let msg = "A 404 Error occurred when requesting " + url + ". That means the server could not find the given page.";
          msg += "\n\tLinked-to from: " + curPage;
          console.error(msg)
        } else if (details.readyState === 4 && details.status === 403) {
          if (forbidden[url] === undefined) {
            forbidden[url] = [curPage];
          } else {
            forbidden[url].push(curPage)
          }
          let msg = "A 403 Error occurred when requesting " + url + ". That means the server considers access to the resource absolutely forbidden.";
          msg += "\n\tLinked-to from: " + curPage;
          console.error(msg)
        } else if (details.readyState === 4 && details.status === 401) {
          if (accessDenied[url] === undefined) {
            accessDenied[url] = [curPage];
          } else {
            accessDenied[url].push(curPage)
          }
          let msg = "A 401 Error occurred when requesting " + url + ". That means access was denied to the client by the server.";
          msg += "\n\tLinked-to from: " + curPage;
          console.error(msg)
        }
         else {
          console.error("AN UNIDENTIFIED ERROR OCURRED!", details);
        }
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

function classifyLinks(doc, domain, curPageURL, quiet) {
  /* Default "quiet" to false. That is, by default, this function prints A LOT
   * of stuff to console. */
  if (quiet === undefined) quiet = false;


  const links = doc.getElementsByTagName("a");
  domain = domain.toLowerCase();
  const domainStrLen = domain.length;
  /* Contains the URLs of all of the local (same-domain) pages linked to from
   * this page: */
  let localLinksFromThisPage = {};

  /* Loop over links: */
  for (let i = 0, len = links.length; i < len; ++i) {
    let link = links[i];
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
      let curPageProtocol = /^(\w+?):\/\//i.exec(curPageURL)[1];
      href = curPageProtocol + href;
    }

    /* Function for adding data about a link to data-logging objects: */
    function recordLinkTo(...loggingObjects) {
      let linkData = {};
      linkData[curPageURL] = href;
      for (var i = 0, len = loggingObjects.length; i < len; ++i) {
        let obj = loggingObjects[i];
        if (obj[link.href] !== undefined) obj[link.href].push(linkData);
        else obj[link.href] = [linkData];
      }
    }

    /* If the link contains a banned string, record it: */
    if (containsBannedString(href)) {
      let bannedStr = recordLinkTo(bannedStrings);

      console.error("Found link " + href+ " containing a banned string: " + bannedStr + ".\n\tLinked-to from: " + curPageURL);
      link.style.border = "4px dashed red";
      link.title = (link.title) ? link.title + "\nBANNED WORD LINK" : "BANNED WORD LINK";
    }

    /* PARSING LINK TYPES: */
    /* Absolute internal link: */
    if (href.substr(0, domainStrLen) === domain) {
      recordLinkTo(allLinks, localLinksFromThisPage)

      if (!quiet) {
        console.log(link);
        console.log(i + ":Absolute Internal:\t" + href);
      }
    }
    /* Absolute external link: */
    else if (href.substr(0,4) === "http") {
      recordLinkTo(allLinks)

      link.style.border = "2px dotted gray";
      link.title = (link.title) ? link.title + "\nAbsolute external link" : "Absolute external link";
    }
    /* Special Link types: */
    else {
      /* Anchor Link: */
      if (href.substr(0,1) === "#") {
        link.style.border = "2px solid pink";
        link.title = (link.title) ? link.title + "\nAnchor link" : "Anchor link";
      }
      /* Email link: */
      else if (href.substr(0,6) === "mailto") {
        recordLinkTo(allLinks);

        link.style.border = "2px solid yellow";
        link.title = (link.title) ? link.title + "\nEmail link" : "Email link";
      }
      /* File link: */
      else if (href.substr(0,4) === "file") {
        recordLinkTo(allLinks);

        link.style.border = "2px dashed blue";
        link.title = (link.title) ? link.title + "\nFile link" : "File link";
      }
      /* Site-Root-Relative Link: */
      else if (href.substr(0,1) === "/") {
        recordLinkTo(allLinks, localLinksFromThisPage);

        if (!quiet) {
          console.log(link);
          console.log(i + ":Root Relative:\t" + href);
        }
      }
      /* Page-Relative and other links: */
      else {
        recordLinkTo(allLinks, localLinksFromThisPage);

        if (!quiet) {
          console.log(link);
          console.log(i + ":Page Relative(?):\t" + href);
        }
      }
    } //Close section for parsing non-absolute links
  } //Close for loop iterating over link elements
  return localLinksFromThisPage;
}

/* A function for acquiring an HTML document from a server: */
function HTMLDocLoader(pageURL, responseCallBack, errorHandler, onComplete) {
  var httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function() {
    if (httpRequest.readyState === XMLHttpRequest.DONE) {
      if (httpRequest.status === 200) { //Code for "Good"
        responseCallBack(httpRequest.responseXML, httpRequest);
      } else {
        if (errorHandler === undefined) {
          console.error("AJAX attempt failed while requesting a document at " + pageURL, "Error code: " + httpRequest.status + "\n", httpRequest);
          console.log("Things might still load, though. Multiple attempts are made per resource.");
        } else {
          errorHandler(httpRequest);
        }
      }
      /* This call-back function will be the last thing executed during this
       * request: */
      if (onComplete !== undefined) {
        onComplete();
      }
    }
  }
  httpRequest.open("GET", pageURL);
  httpRequest.responseType = "document";
  httpRequest.send();
}


/* Run Script: */

var siteMap = classifyLinks(document, window.location.origin.toLowerCase(), window.location.href);
visited[window.location.href] = [true];

visitLinks(window.location.href, siteMap);
