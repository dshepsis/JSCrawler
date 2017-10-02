function outlineFadeToParents(ele, width, r, g, b, a = 1) {
  ele.style.outline = `${width}px solid rgba(${r}, ${g}, ${b}, ${a})`;
  let parent = ele.parentElement;
  if (parent && parent !== document.body) {
    outlineFadeToParents(
      ele.parentElement,
      Math.max(width*0.8, 1),
      r, g, b,
      Math.max(a*0.8, 0.2)
    )
  }
}

function highlight(arr) {
  let links = document.querySelectorAll("a");
  let retObj = {};
  for (let url of arr) {
    retObj[url] = "None";
  }
  for (let i = 0, len = links.length; i < len; ++i) {
    let link = links[i];
    let matchIndex = arr.indexOf(link.getAttribute("href"));
    if (matchIndex !== -1) {
      retObj[arr[matchIndex]] = "Found";
      outlineFadeToParents(link, 8, 255, 0, 0);
      link.style.boxShadow = "8px 8px 5px 2px rgba(0,0,0,0.4)";
    }
  }
  let images = document.querySelectorAll("img");
  for (let i = 0, len = images.length; i < len; ++i) {
    let image = images[i];
    let matchIndex = arr.indexOf(image.getAttribute("src"));
    if (matchIndex !== -1) {
      retObj[arr[matchIndex]] = "Found";
      outlineFadeToParents(image, 8, 255, 0, 0);
      image.style.boxShadow = "8px 8px 8px 8px rgba(0,0,0,0.4)";
    }
  }

  return retObj;
}

console.table(
  highlight([])
);
