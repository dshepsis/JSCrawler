class ElementInstance {
  constructor (documentID, elementInDocument) {
    this.document = documentID;
    this.element = elementInDocument;
  }
}

class ElementData /* @abstract */ {
  constructor(id, instanceDatum, ...labels) {
    if (new.target === ElementData) {
      throw new TypeError("ElementData is abstract and cannot be constructed directly. Use a sub-class instead.");
    }
    this.id = id;
    if (!instanceDatum instanceof ElementInstance) {
      throw new TypeError("instanceDatum must be of type ElementInstance");
    }
    this.instances = [instanceDatum];
    this.labels = labels;
  }
  static singularPush(arr, item) {
    if (arr.indexOf(item) !== -1) return false;
    arr.push(item);
    return true;
  }
  addLabels(...moreLabels) {
    for (let label of moreLabels) {
      singularPush(this.labels, label);
    }
  }
  addInstance(instanceDatum) {
    if (!instanceDatum instanceof ElementInstance) {
      throw new TypeError("instanceDatum must be of type ElementInstance");
    }
    singularPush(this.instances, instanceDatum);
  }
}

class LinkData extends ElementData {
  constructor(linkElement, pageURL, ...labels) {
    let firstInstance = new ElementInstance(pageURL, linkElement);
    super(linkElement.href, firstInstance, ...labels);
    this.location = linkElement;
  }
  toString() {
    return this.element.getAttribute("href");
  }
}

class ImageData extends ElementData {
  constructor(imageElement, pageURL, ...labels) {
    let firstInstance = new ElementInstance(pageURL, imageElement);
    super(imageElement.src, firstInstance, ...labels);
    this.element = imageElement;
    this.location = new URL(this.element.src);
  }
  toString() {
    return this.element.getAttribute("src");
  }
}
