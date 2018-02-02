'use strict';

const fs = require('fs');
const childProcess = require('child_process');

const templateFileName = process.argv[2];
fs.watch(templateFileName, (eventType, fileName)=>{
  if (eventType === 'change') {
    childProcess.fork('compileTemplate', [fileName]);
  }
});
