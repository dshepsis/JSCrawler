states = [];
httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function() {
	let state = [];
    for (prop in httpRequest) state.push(`${prop}: ${httpRequest[prop]}`);
	states.push(state);
    console.log(httpRequest);
  }
  httpRequest.open("GET", "/robots.txt");
  httpRequest.send();

window.setTimeout(()=>{console.log("ABORTED");httpRequest.abort();let state = [];
    for (prop in httpRequest) state.push(`${prop}: ${httpRequest[prop]}`);
	states.push(state); after();}, 10);

function after() {
  function isColumnAlwaysSame(arr2, col) {
    let val = arr2[0][col];
    //console.log(val);
    for (let row = 1, len = arr2.length; row < len; ++row) {
      //console.log(arr2[row][col]);
      if (arr2[row][col] !== val) return false;
    }
    return true;
  }

  changingStates = states.map((row)=>{return row.filter((col,index)=>!isColumnAlwaysSame(states, index))});
  console.log(changingStates);
}



//Separate:
let badReqs = allRequests.filter(r=>r.callbackFailed);
console.log(badReqs);

let histTypes = {};
allRequests.forEach(r=>{
  let histString = JSON.stringify(r.readyStateHistory);
  if (histTypes[histString]) histTypes[histString].push(r);
  else histTypes[histString] = [r];
})
console.log(histTypes);

//separate:::::
httpRequest = new XMLHttpRequest();
state = [];
  httpRequest.onreadystatechange = function() {
console.log(httpRequest);
if (httpRequest.readyState === 2) {
      headers = httpRequest.getAllResponseHeaders();
      console.log(headers);
      for (prop in httpRequest) state.push(`${prop}: ${httpRequest[prop]}`);
	  httpRequest.abort();
    }

  }

  httpRequest.open("GET", "/files/financingyoured12915pdf");
httpRequest.setRequestHeader("Authorization", `BasicCustom`);
  httpRequest.send();
