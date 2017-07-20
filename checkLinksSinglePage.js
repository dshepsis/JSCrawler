/* Settings variables: */
const RECOGNIZED_FILE_TYPES = ["pdf", "doc", "docx", "png", "xls", "xlsx", "ppt", "pptx"];

const BANNED_STRINGS = ["drupaldev"];
function containsBannedString(href) {
  for (var i = 0, len = BANNED_STRINGS.length; i < len; ++i) {
    let badStr = BANNED_STRINGS[i];
    if (href.indexOf(badStr) !== -1) return badStr;
    return false;
  }
}

/* Script relevant: */
var visited = {};
var allLinks = {};
var redirects = {};
var notFound = {};
var accessDenied = {};
var bannedStrings = {};


/* Function definitions: */

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

classifyLinks(document, window.location.origin.toLowerCase(), window.location.href);
