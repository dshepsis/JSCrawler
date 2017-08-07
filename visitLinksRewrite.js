function visitLinks2(curPage, linkObj) {

  console.log("Checking links found on: " + curPage)

  for (let url in linkObj) {
    /* Note: this version is slightly different to the one found in classifyLinks,
     * as it uses linkObj which is already filled out by classifyLinks. */
    function recordLinkTo(...loggingObjects) {
      let linkData = linkObj[url];
      for (let i = 0, len = loggingObjects.length; i < len; ++i) {
        let obj = loggingObjects[i];
        if (obj[url] !== undefined) obj[url].push(linkData);
        else obj[url] = [linkData]; //<3
      }
    }

    if (redirects[url] !== undefined) {
      recordLinkTo(redirects);
      continue;
    }

    /* Mark this page as having been "visited" or checked for links. This is done
    * as soon as possible to mitigate the chances of a race condition where a page
    * is checked twice, which is possible due to this code being asynchronous. */
    recordLinkTo(visited);
    /* Do not re-analyze a page we have already visited: */
    if (visited[url] !== undefined) {
      continue;
    }

    /**
     * Making the HTTP Request:
     */
    let httpRequest = new XMLHttpRequest();
    allRequests.push(req);

    /* Callbacks: */
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
      visitLinks2(url, newLinks);
    }

    function errorHandler (details) {
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
    }

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

    function onReadyStateChange (request) {
      if (request.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        let contentType = request.getResponseHeader("Content-Type");
        if (contentType !== "text/html") {
          recordLinkTo(badContentType);
          request.abort();
        }
      }
    }

    /* Start filing request: */

    httpRequest.onreadystatechange = function() {
      onReadyStateChange(httpRequest);
      if (httpRequest.readyState === XMLHttpRequest.DONE) {
        if (httpRequest.status === 200) { //Code for "Good"
          onGoodResponse(httpRequest);
        } else {
          onError(httpRequest);
        }
        onComplete(httpRequest);
      }
    }
    httpRequest.givenURL = url; //@debug
    httpRequest.open("GET", url);
    httpRequest.responseType = "document";

    httpRequest.send();
    httpRequest.sent = true;

    requestCounter.increment();
  } //Close for loop iterating over links
} //Close function visitLinks2
