/**
 * Breaks a given URL string into its tokens (aka "components") as defined by
 * Section 3 of RFC 3986 (http://www.ietf.org/rfc/rfc3986.txt). To partially
 * restate it, there are a few different forms a URL may take, but they are
 * generally broken up into 5 major tokens:
 *
 *   - Scheme: E.G. "http", "https", "mailto", "file", "ftp", etc.
 *     - The part before the first colon ":"
 *     - Defines how the rest of the URL will be restricted, identified, and parsed.
 *   - Authority: E.G. "www.google.com", "www.ietf.org", etc.
 *     - The part after the scheme, termated by a "/", "?", "#", or the end of
 *       the url.
 *     - Specifies the authority/organization who will receive the corresponding
 *       request and parse it.
 *   - Path: E.G. "about", "about.html", "rfc/rfc3398.txt", etc.
 *     - The part after the authority, terminated by a "?", "#" or the end of
 *       the url.
 *     - Specifies the location and identity of the corresponding resource.
 *   - Query:
 *     - The part after the path, following a "?". Terminated by the fragment or
 *       the end of the url
 *     - Represents, typically, additional data about the resource, including
 *       parameters for the recipient of the request, typically in the form of
 *       "key=value" pairs.
 *     - For example, "www.example.com/my/path?name=myQuery" contains the
 *       query-string "name=myQuery"
 *   - Fragment:
 *     - The part after the path and query (if one is present), follwing a "#".
 *       Terminated by the end of the url.
 *     - Represents the location of a secondary resource, typically within the
 *       main resource.
 *     - Used for "anchor" links on web-pages. That is, links which
 *       automatically scroll the browser window to a specified point in the
 *       document.
 *
 * Here are some examples of URLs and how they would be tokenized:
 *
 *       foo://example.com:8042/over/there?name=ferret#nose
 *       \_/   \______________/\_________/ \_________/ \__/
 *        |           |            |            |       |
 *     scheme     authority       path        query   fragment
 *        |   _____________________|__
 *       / \ /                        \
 *       urn:example:animal:ferret:nose
 *
 * @param {string} url - The URL to be tokenized;
 * @returns {object|null} An object with keys for the each of the tokens which
 *   the URL contained, and values for those corresponding tokens.
 */
function tokenizeURL (url) {
  /* Enumerable state values: */
  let s = -1;
  const FIND_SCHEME_END = ++s;
  const FIND_TOKEN_AFTER_SCHEME = ++s;
  const FIND_AUTHORITY_END = ++s;
  const FIND_PATH_END = ++s;
  const FIND_QUERY_END = ++s;
  const FIND_FRAGMENT_END = ++s;

  /* Initial state: */
  let state = FIND_SCHEME_END;

  let tokens = {};
  let breakPoints = {};
  function changeState(index, endingOf, startOf, newState) {
    if (endingOf !== null) {
      let tokenBounds = breakPoints[endingOf];
      tokenBounds[1] = index;
      tokens[endingOf] = url.substring(tokenBounds[0], tokenBounds[1]);
    }
    if (startOf !== null) {
      state = newState;
      breakPoints[startOf] = [index + 1, undefined];
    }
  }

  /* Loop over url, character-by-character, to parse it into tokens.
   * This is done using a state machine working off a switch statement: */
  let len = url.length;
  for (let c = 0; c < len; ++c) {
    let char = url.charAt(c);

    /* State machine: */
    switch (state) {
      case FIND_SCHEME_END:
        breakPoints.scheme = [0, undefined];
        if (char === ":") {
          /* End the scheme state at index c, but don't start a new state: */
          changeState(c, "scheme", null);
          state = FIND_TOKEN_AFTER_SCHEME;
        }
        if (char === "/") {
          /* If there is a slash before a colon, then the url is not well-formed. */
          return null;
        }
        break;
      case FIND_TOKEN_AFTER_SCHEME:
        if (url.substr(c, 2) === "//") {
          /* Here we step forward so onto the second slash. changeState assumes
           * that the index parameter (c) refers to the terminating character
           * of the previous token, so we must be 1 character before the
           * authority token begins: */
          ++c;
          /* Start the authority state: */
          changeState(c, null, "authority", FIND_AUTHORITY_END);
        } else {
          /* If we didn't find a "//" to signal the start of an authority, step
           * back onto the colon character, which terminates the scheme token: */
          --c;
          changeState(c, null, "path", FIND_PATH_END);
        }
        break;
      case FIND_AUTHORITY_END:
        /* If we found a terminating character, end the authority state, and
         * move onto a different state depending on the character found: */
        if (char === "/")      changeState(c, "authority", "path",     FIND_PATH_END);
        else if (char === "?") changeState(c, "authority", "query",    FIND_QUERY_END);
        else if (char === "#") changeState(c, "authority", "fragment", FIND_FRAGMENT_END);
        break;
      case FIND_PATH_END:
        /* Same as above: */
        if (char === "?")      changeState(c, "path", "query",    FIND_QUERY_END);
        else if (char === "#") changeState(c, "path", "fragment", FIND_FRAGMENT_END);
        break;
      case FIND_QUERY_END:
        if (char === "#")      changeState(c, "query", "fragment", FIND_FRAGMENT_END);
        break;
      case FIND_FRAGMENT_END:
        /* Since the fragment (the part after the first # after the path) is the
         * last token in a link whenever it is present, we don't need to worry
         * about changing the state within the loop. Terminating the fragment
         * token is left to the switch statement following the loop. */
         break;
      default:
        throw new Error(`Unknown state <${state}> when parsing URL: ${url}!`);
    }//Close switch block state machine
  }//Close for loop iterating over url char-by-char

  /* At this point, we've iterated through the entire url, so we just need to
   * close the final state: */
  switch (state) {
    case FIND_SCHEME_END:
      /* If we didn't find the end of the scheme, then the url is malformed: */
      return null;
    case FIND_TOKEN_AFTER_SCHEME:
      /* If the url ended before we determined which token (authority or path)
       * follows state, then the answer must be an empty path. For completeness's
       * sake, I set the breakPoints manually, though this isn't necessary. */
      breakPoints.path = [len, len];
      tokens.path = "";
      break;
    case FIND_AUTHORITY_END:
      changeState(len, "authority", null);
      break;
    case FIND_PATH_END:
      changeState(len, "path", null);
      break;
    case FIND_QUERY_END:
      changeState(len, "query", null);
      break;
    case FIND_FRAGMENT_END:
      changeState(len, "fragment", null);
      break;
    default:
      throw new Error(`Unknown state <${state}> when parsing URL: ${url}!`);
  }
  return tokens;
}
