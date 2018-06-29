/* globals ElementRecord, ELEMENT_LABELS, GROUP_LABELS */
/* eslint-disable no-unused-vars */
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

function getRandEntry(arr) {
  const len = arr.length;
  return arr[Math.floor(Math.random()*len)];
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

/* Step is positive, even for reverse ranges: */
const range = (s, e, step = 1)=>{
  if (step <= 0) throw new Error('Step must be a positive number');
  if (s > e) [s, e] = [e, s];
  const length = Math.floor((e - s) / step) + 1;
  const rangeArr = Array.from({length});
  for (let i = 0, v = s; v <= e; ++i, v += step) rangeArr[i] = v;
  return rangeArr;
};

console.log(ElementRecord.ALL.length);

range(2, 10).map(n=>`${n}\t${extTestTime(extendedXOR, n, 100)/100}`).join('\n');
