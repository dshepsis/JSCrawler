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
  //requestCounter.displayElement.remove();

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

  let lorem = `1
  2
  3
  4
  5
  6
  7
  8
  9
  10
  11
  12
  13
  14
  15
  16
  18
  19
  20
  21
  22
  23
  24`;

  let ipsum = `1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 2 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 3 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 4 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 5 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 7 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24`

  let combo = `1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 2 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 3 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 4 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 5 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 7 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
18
19
20
21
22
23
24`;

  let pre = makeElement("pre", lorem);
  let preCont = makeElement("div", pre, {class:"crlr-output"});

  modalContent.appendChild(preCont);

  let preb = makeElement("pre", lorem);
  let preContb = makeElement("div", preb, {class:"crlr-output"});

  modalContent.appendChild(preContb);

  let pre2 = makeElement("pre", ipsum);
  let preCont2 = makeElement("div", pre2, {class:"crlr-output"});

  modalContent.appendChild(preCont2);

  let pre3 = makeElement("pre", combo);
  let preCont3 = makeElement("div", pre3, {class:"crlr-output"});

  modalContent.appendChild(preCont3);

  document.body.insertBefore(modal, document.body.childNodes[0]);
}

presentResults();
