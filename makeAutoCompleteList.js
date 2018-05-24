const sugs = [
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

const textbox = document.getElementById('txt');
const container = document.getElementById('cont');
const makeTableRow = (sugStr, metadata)=>{
  const sugColumn = makeElement('td', metadata.defaultContents());
  const isEmpty = (sugStr.charCodeAt(0)%2===0);
  const emptyColumn = makeElement('td', isEmpty ? 'empty' : '');
  const row = makeElement('tr', [sugColumn, emptyColumn], {
    tabIndex: '0', //Allow tab navigation to this element in normal order
    'data-value': sugStr
  });
  if (isEmpty) row.classList.add('empty-label');
  return row;
};
const autoComp = makeAutoCompleteList(textbox, sugs, makeTableRow, 'table');
autoComp.id = "suggestions";
container.appendChild(autoComp);

/**
 * Creates an auto-complete/suggestion-list element for a given input element
 * using a given array of suggestions.
 *
 * By default, the returned element is a <ul>, containing a list of <li> which
 * contain the suggestion text. If the input element is typed into, the
 * list will only include matching suggestions. Each suggestion will have
 * any matching characters bolded via <strong> elements.
 *
 * This method adds event listeners to the passed input element, the returned
 * element, and the document to support default functionality. The returned
 * element supports two custom methods: show() and hide(), which remove and add
 * the "hidden" class to the element, respectively. The element also has
 * custom "show" and "hide" events, which are fired both by the aforementioned
 * methods and by the default behavior.
 *
 * Accepts two optional parameters, sugToEleMap and listEle.
 *
 * sugToEleMap may be a string, object, Map, or function. If it is a string, it
 * merely specifies the tag-type used for suggestions (as opposed to the default
 * "li"). If it is an object or Map, it will be used as a map from a suggestion
 * string to an HTML element. If it is a function, that function will be passed
 * the suggestion string and some metadata (such as the default list of text and
 * <strong> elements) and must return an HTML element.
 *
 * listEle may be a string or an HTML element. If it is a string, it specifies
 * the tag-type used for the overall list (as opposed to the default "ul"). If
 * it is an HTML element, that element will be used as the list container, even
 * if it already is in the DOM. The element should not already contain children
 * as they will be deleted whenever the list of suggestions changes.
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
  const hideSugListFocusInput = (detail)=>{
    inputEle.focus();
    sugList.classList.add('hidden');
    sugList.dispatchEvent(new CustomEvent('hide', {detail}));
  };
  const showSugList = (detail)=>{
    sugList.classList.remove('hidden');
    sugList.dispatchEvent(new CustomEvent('show', {detail}));
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
      targetSuggestion.innerText
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
    });
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
    targetSuggestion.focus();
  });
  sugList.addEventListener("keydown", (e)=> {
    const targetSuggestion = getAncestorWithParent(e.target, sugList);
    if (e.key === "Enter")  {
      const eleValue = nullDefault(
        targetSuggestion.getAttribute('data-value'),
        targetSuggestion.innerText
      );
      inputEle.value = eleValue;
      hideSugListFocusInput({
        reason: 'enter-in-list',
        selectionMade: true,
        selectionText: eleValue,
        selectionElement: targetSuggestion,
        sourceEvent: e
      });
    } else if (e.key === "ArrowUp") {
      const prevSug = targetSuggestion.previousSibling;
      if (prevSug === null) {
        hideSugListFocusInput({
          reason: 'close-up',
          selectionMade: false,
          sourceEvent: e
        });
      } else {
        prevSug.focus();
      }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      const nextSug = targetSuggestion.nextSibling;
      if (nextSug !== null) {
        nextSug.focus();
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
  /* Events for populating the suggetsion list and navigating to and from it via
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
        });
        sugList.firstChild.focus();
        e.preventDefault();
      }
    } else {
      if (sugList.firstChild === null) return;
      switch (e.key) {
        case 'Enter': {
          const targetSuggestion = sugList.firstChild;
          const eleValue = nullDefault(
            targetSuggestion.getAttribute('data-value'),
            targetSuggestion.innerText
          );
          inputEle.value = eleValue;
          hideSugListFocusInput({
            reason: 'enter-in-input',
            selectionMade: true,
            selectionText: eleValue,
            selectionElement: targetSuggestion,
            sourceEvent: e
          });
          break;
        }
        case 'ArrowDown':
          sugList.firstChild.focus();
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
      hideSugListFocusInput({
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
  return (possiblyNullVal === null) ? defaultValue : possiblyNullVal;
}

/* Removes all of an element's immediate children: */
function clearChildren(parent) {
  while (parent.firstChild !== null) {
    parent.removeChild(parent.firstChild);
  }
}

/* A function for appending an array of children to a parent HTMLElement: */
function appendChildren (parent, children) {
  function appendItem(item) {
    if (item instanceof HTMLElement) {
      parent.appendChild(item);
    } else {
      const text = document.createTextNode(String(item));
      parent.appendChild(text);
    }
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      appendItem(child);
    }
  } else {
    appendItem(children);
  }
}

/**
 * Makes an HTML element with content. This is similar to the
 * document.createElement() method, but allows text or other elements to be
 * added as children in-place. The optional attrObj parameter allows for
 * attributes such as id, class, src, and href to also be specified in-place.
 */
function makeElement(type, content, attrObj) {
  /* The new element being populated: */
  const newEle = document.createElement(type);

  /* If no content parameter was passed, leave the element childless. Otherwise,
   * add the content (array or single item) to newEle: */
  if (content !== undefined) {
    appendChildren(newEle, content);
  }

  /* Apply information from the attributes object: */
  if (attrObj !== undefined) {
    for (const attribute of Object.keys(attrObj)) {
      newEle.setAttribute(attribute, attrObj[attribute]);
    }
  }
  return newEle;
}
