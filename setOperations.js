/* globals getAllRecordsLabelled, ElementRecord, ELEMENT_LABELS, GROUP_LABELS */
/* eslint-disable no-unused-vars */
function a_and_b_1(a, b) { //Fast 0.2949699999997392 ms on RBHS
  let res = getAllRecordsLabelled(a);
  if (res !== null) res = res.filter(e=>e.group.isLabelled(b));
  return res;
}

const genericFilter = (binFn)=> (a, b)=>{
  return ElementRecord.ALL.filter(e=>binFn(e.isLabelled(a), e.group.isLabelled(b)));
};

const isLabelled = (record, label)=> {
  if (ELEMENT_LABELS.has(label)) return record.isLabelled(label);
  else if (GROUP_LABELS.has(label)) return record.group.isLabelled(label);
  return null;
};

const extendedFilter = (filterFn)=> (labels)=>{
  /* Amazing */
  /* filterFn is passed an array of lazy-expressions representing whether the
   * label in the corresponding index of labels matches the given record: */
  return ElementRecord.ALL.filter(e=>filterFn(labels.map(l=> ()=>isLabelled(e, l))));
};


function a_and_b_2(a, b) { //Slow 3.4575199999991804 ms on RBHS
  return ElementRecord.ALL.filter(e=>e.isLabelled(a) && e.group.isLabelled(b));
}

//genericFilter((a,b)=>a||b) //Slow 6.843180000002031 ms
function a_or_b_1(a, b) { //Fast 0.9641299999987707 ms on RBHS
  const aRecs = getAllRecordsLabelled(a);
  const bRecs = getAllRecordsLabelled(b);
  if (aRecs === null) return (bRecs === null) ?  [] : bRecs;
  if (bRecs === null) return aRecs;
  for (const bRec of bRecs) {
    if (!bRec.isLabelled(a)) aRecs.push(bRec);
  }
  return aRecs;
}

function a_or_b_2(a, b) { //Slow 5.652000000001863 ms on RBHS
  return ElementRecord.ALL.filter(e=>e.isLabelled(a) || e.group.isLabelled(b));
}

function a_or_b_3(a, b) { //2.4627000000036787 ms
  const aRecs = getAllRecordsLabelled(a);
  const bRecs = getAllRecordsLabelled(b);
  if (aRecs === null) return (bRecs === null) ?  [] : bRecs;
  if (bRecs === null) return aRecs;
  const aSet = new Set(aRecs);
  for (const bRec of bRecs) aSet.add(bRec);
  return aSet.values();
}

/* Not: */
function not(a) { //Slow 6.056899999995716 ms
  return ElementRecord.ALL.filter(e=>!e.isLabelled(a));
}
function notGroup(a, b) { //Sloow 9.26679999998212
  return ElementRecord.ALL.filter(e=>!e.group.isLabelled(b));
}
function a_and_not_b(a, b) { //Fast 0.5154000000040978
  let res = getAllRecordsLabelled(a);
  if (res !== null) res = res.filter(e=>!e.group.isLabelled(b));
  return res;
}

function not_a_and_not_b_1(a, b) { //Wicked Slow 17.19280000001937
  let res = not(a);
  if (res !== null) res = res.filter(e=>!e.group.isLabelled(b));
  return res;
}
function not_a_and_not_b_2(a, b) { //Not as slow? 11.033399999986402 ms
  return ElementRecord.ALL.filter(e=>!e.isLabelled(a) && !e.group.isLabelled(b));
}
//testTime(genericFilter((a,b)=>!a&&!b), n=1000)/n //12.240900000005029

function a_or_not_b(a, b) { //V Slow 14.584300000017508 ms
  const aRecs = getAllRecordsLabelled(a);
  const bRecs = notGroup(undefined, b);
  if (aRecs === null) return (bRecs === null) ?  [] : bRecs;
  if (bRecs === null) return aRecs;
  for (const bRec of bRecs) {
    if (!bRec.isLabelled(a)) aRecs.push(bRec);
  }
  return aRecs;
}

//testTime(genericFilter((a,b)=>a!==b), n=1000)/n //7.683500000013039
function a_xor_b(a, b) { //Not that slow, surprisingly 2.0242599999997766 ms
  /* Maybe we could avoid this intermediate array by circumventing getAllRecordsLabelled
   * or overloading it to accept 2 arrays of labels: 1 for "has all" and 1 for "has none" */
  const aRecs = getAllRecordsLabelled(a);
  const bRecs = getAllRecordsLabelled(b);
  if (aRecs === null) return (bRecs === null) ?  [] : bRecs;
  if (bRecs === null) return aRecs;
  const res = aRecs.filter(e=>!e.group.isLabelled(b));
  for (const bRec of bRecs) {
    if (!bRec.isLabelled(a)) res.push(bRec);
  }
  return res;
}

function getRandEntry(arr) {
  const len = arr.length;
  return arr[Math.floor(Math.random()*len)];
}

function testTime(fn, n=1000) {
  const startTime = performance.now();
  for (let i = 0; i < n; ++i) {
    const a = getRandEntry(ELEMENT_LABELS.list);
    const b = getRandEntry(GROUP_LABELS.list);
    fn(a, b);
  }
  const endTime = performance.now();
  return endTime - startTime;
}

const ALL_LABELS = ELEMENT_LABELS.list.concat(GROUP_LABELS.list);
function getRandLabels(n) {
  const labels = Array.from({length: n});
  for (let i = 0; i < n; ++i) {
    labels[i] = getRandEntry(ALL_LABELS);
  }
  return labels;
}

function extTestTime(fn, numLabels, times=100) {
  const startTime = performance.now();
  for (let i = 0; i < times; ++i) {
    fn(getRandLabels(numLabels));
  }
  const endTime = performance.now();
  return endTime - startTime;
}

/* Useful because xor checks every label, so this is a worst-case: */
const reduceXOR = lazyBoolArr=> {
  let acc = false;
  for (const lazyBool of lazyBoolArr) acc = (acc !== lazyBool());
  return acc;
};
const extendedXOR = extendedFilter(reduceXOR);
