/* Mostly just testing for responseURL and contentType: */
httpRequest = new XMLHttpRequest();
function checkRequestHeaders(request) {
      /* Checks if the request resolved to a file rather than an HTML document: */
      function findURLExtension(url) {
        for (let i = url.length - 1; i >= 0; --i) {
          if (url.charAt(i) === ".") return url.substring(i+1).toLowerCase();
        }
        return undefined;
      }
      let extension = findURLExtension(request.responseURL);
	  console.log("url! " + request.responseURL);
      let isRecognizedFile = (RECOGNIZED_FILE_TYPES.indexOf(extension) !== -1);

      let contentType = request.getResponseHeader("Content-Type");
      console.log("Content type! " + contentType);
      let validContentType = "text/html";
      if (contentType.substr(0, validContentType.length) !== validContentType) {
        request.resolvedToFile = true;
      }
    }
httpRequest.onreadystatechange = function() {
      if (httpRequest.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        checkRequestHeaders(httpRequest);
      } else if (httpRequest.readyState === XMLHttpRequest.DONE) {
        if (httpRequest.status === 200) { //Code for "Good"
          console.log(httpRequest);
        } else {
          console.error("REQUEST MESSED UP!!!");
        }
        console.log("done!");
      }
    }
        httpRequest.open("GET", url);
        httpRequest.responseType = "document";

        httpRequest.send();
        httpRequest.sent = true;
