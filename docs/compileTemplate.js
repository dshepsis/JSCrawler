'use strict';

const fs = require('fs');
const moment = require('moment');

function pluckAllExcept(arr, indices) {
  let excludedSet;
  if (excludedSet instanceof Set) {
    excludedSet = indices;
  } else if (typeof indices === 'number') {
    excludedSet = new Set();
    excludedSet.add(indices);
  } else {
    excludedSet = new Set(indices);
  }
  const plucked = [];
  for (let i = 0, len = arr.length; i < len; ++i) {
    if (excludedSet.has(i)) continue;
    plucked.push(arr[i]);
  }
  return plucked;
}

const args = process.argv.slice(2);
const watchFileIndex = args.findIndex(a=>/^(-w|--watch)$/.test(a));
const otherArgs = pluckAllExcept(args, watchFileIndex);
const templateFileName = otherArgs[0];
const outputFileName = (
  otherArgs[1] ||
  templateFileName.replace(/\.template$/, '')
);
const watchFile = (watchFileIndex !== -1);

const tplOuterRegex = /<template>([\s\S]+?)<\/template>/g;
const tplInnerRegex = /^([^:]+)(?::([\s\S]+))?$/;

if (watchFile) {
  fs.watch(templateFileName, (eventType/*, fileName*/)=>{
    if (eventType === 'change') {
      compileTemplate(templateFileName);
    }
  });
}
compileTemplate(templateFileName);

const devRefreshScript = (`<script>
let altPressed = false;
window.addEventListener('keydown', (e)=>{
  if (altPressed) return;
  if (e.key === 'Alt') altPressed = true;
}, false);
window.addEventListener('focus', ()=>{
  if (altPressed) location.reload();
}, false);
window.addEventListener('visibilitychange', ()=>{
  if (!document.hidden) location.reload();
}, false);
</script>`);

function compileTemplate(fileName) {

  fs.readFile(fileName, 'utf8', processTemplateAndWriteFile);

  function processTemplateAndWriteFile(err, fileStr) {
    if (err) {
      throw err;
    }

    const tplTokens = lexTemplate(fileStr);
    replaceTemplates(tplTokens, (compiledTemplate)=>{
      const newFileContent = compiledTemplate;
      const newFilePreview = newFileContent
        .substr(0, 500)
        .replace(/[\r\n]+/g, '$&\t');
      console.log(
        `Here's a preview of the replaced template:\n\t${newFilePreview}`
      );
      fs.writeFile(outputFileName, newFileContent, 'utf8', (err)=>{
        if(err) console.log(err);
      });
    });
  }

  function lexTemplate(template) {
    const tplTokens = [];
    let tokenStartIdx = 0;
    let tplMatch = tplOuterRegex.exec(template);
    while (tplMatch !== null) {
      tplTokens.push({
        template: false,
        rawString: template.substring(tokenStartIdx, tplMatch.index)
      });

      const outterTplStr = tplMatch[0];
      const innerTplStr = tplMatch[1].trim();
      const tplInnerTokens = tplInnerRegex.exec(innerTplStr);

      if (tplInnerTokens === null) throw new Error(
        "Templates must have the format 'directive: argument'. "+
        `Instead, '${innerTplStr}' was found.`
      );

      /* For argument-less directives: */
      let argument = tplInnerTokens[2];
      if (argument !== undefined) argument = argument.trim();

      tplTokens.push({
        template: true,
        rawString: outterTplStr,
        innerString: innerTplStr,
        directive: tplInnerTokens[1].trim(),
        argument
      });

      tokenStartIdx = tplOuterRegex.lastIndex;
      tplMatch = tplOuterRegex.exec(template);
    }
    tplTokens.push({
      template: false,
      rawString: template.substring(tokenStartIdx, template.length)
    });

    return tplTokens;
  }

  function replaceTemplates(tokens, cb) {
    const outputTokens = [];
    const whenDone = ()=>cb(outputTokens.join(''));

    let asyncTasks = 0;
    const startTask = ()=>++asyncTasks;
    const finishTask = ()=>{
      --asyncTasks;
      if(asyncTasks <= 0) whenDone();
    };

    for (let i= 0, len = tokens.length; i < len; ++i){
      const token = tokens[i];
      if (!token.template) {
        outputTokens[i] = token.rawString;
        continue;
      }

      switch (token.directive) {
        case 'file':
          startTask();
          fs.readFile(token.argument, 'utf8', (err, fileStr)=>{
            if (err) {
              console.log(err);
            }
            outputTokens[i] = fileStr.replace(/[\r\n]+$/, '');
            finishTask();
          });
          break;
        case 'date':
          outputTokens[i] = moment().format(token.argument);
          break;
        case 'dev-refresh':
          outputTokens[i] = devRefreshScript;
          break;
        default:
          console.warn(`WARNING: Unknown template '${token.innerString}'.`);
          outputTokens[i] = '';
      }
    }
    /* If no asynchronous tasks were ever started: */
    if (asyncTasks === 0) {
      setImmediate(whenDone);
    }
  }
}
