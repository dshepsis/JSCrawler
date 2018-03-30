'use strict';

const fs = require('fs');
const argumentParser = require('yargs');
const dateFormatter = require('moment');
const fileWatcher = require('chokidar');

const argv = (argumentParser
  .usage(
    "$0 <templatePath> [outputPath]",
    "Generate a file based on an input template file.",
    (yargsDetail)=>{(yargsDetail
      .positional('templatePath', {
        type: 'string',
        description: 'The path of the template file to be parsed.'
      })
      .positional('outputPath', {
        type: 'string',
        description: 'The path of the output file, compiled from the template file.'
      })
    );}
  )
  .option('watch', {
    alias: 'w',
    type: 'boolean',
    description: (
      'Start a file watcher to observe the template file for changes. '+
      'Terminate the watcher by pressing CTRL+C.'
    )
  })
  .option('v', {
    alias: 'validate',
    boolean: true,
    description: (
      "Instead of generating an output file, verify that the file "+
      "matches the output of compiling the template."
    )
  })
  .strict(true)
  .argv
);

/* Extra validation: */
if (argv._.length > 0) {
  argumentParser.showHelp();
  console.error(
    `Unknown positional arguments: [${argv._}].`+
    ` If your path contains spaces, surround it with quotation marks "".`
  );
  return;
}
if (argv.outputPath === undefined && !argv.templatePath.endsWith('.template')) {
  argumentParser.showHelp();
  console.error(
    `If no outputPath is specified, the templatePath must end with `+
    `'.template'.\nInstead, the given templatePath was '${argv.templatePath}.'`
  );
  return;
}
/* Validation complete */

const argOutputPath = (
  argv.outputPath ||
  argv.templatePath.replace(/\.template$/, '')
);

const tplOuterRegex = /<template>([\s\S]+?)<\/template>/g;
const tplInnerRegex = /^([^:]+)(?::([\s\S]+))?$/;

/* If the `--watch` flag was set, start up a chokidar file watcher. The listener
 * will be added later, after declaring the compileTemplate function.
 * We need to have this watcher available so we can add other files to watch
 * procedurally, so that we can cover changes in files linked to by the
 * template via <template>file: path</template> */
const tplWatcher = (argv.watch) ? fileWatcher.watch(argv.templatePath) : null;

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

function replaceTemplates(tokens, cbWithReplacedTokens) {
  /* Un-indenting this so make it easier to type HTML with line-breaks: */
/* eslint-disable indent */
const TEMPLATE_STRINGS = Object.freeze({
  devRefreshScript: (
`<script>
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
</script>`),

  editWarning: (
`<!--############################################################################
# WARNING: DO NOT EDIT THIS FILE. EDIT ${argv.templatePath} INSTEAD,            #
#   THEN USE "node compileTemplate ${argv.templatePath}" FROM THE COMMAND LINE! #
#############################################################################-->`)
});
  /* eslint-enable indent */

  const outputTokens = [];
  const whenDone = ()=>cbWithReplacedTokens(outputTokens.join(''));

  let asyncTasks = 0;
  const startTask = ()=>++asyncTasks;
  const finishTask = ()=>{
    --asyncTasks;
    if(asyncTasks <= 0) whenDone();
  };

  /* Loop over the token objects and replace any which correspond to a
   * <template> tag with the corresponding replacement string: */
  for (let i = 0, len = tokens.length; i < len; ++i){
    const token = tokens[i];

    /* If the token is not a <template> tag (i.e. it is the text between
     * <template> tags), then simply insert the text un-processed: */
    if (!token.template) {
      outputTokens[i] = token.rawString;
      continue;
    }

    /* Generate a replacement string based on the <template>'s directive. The
     * syntax is <token>directive: argument</token>. The argument may be
     * optional for some directives. */
    switch (token.directive) {
      case 'file': {
        /* Include the contents of a file in place of the <template> tag: */
        startTask();
        const includedFileName = token.argument;
        /* If --watch is enabled, watch any included files for changes, on top
         * of the template file itself: */
        if (tplWatcher) {
          tplWatcher.add(includedFileName);
        }
        fs.readFile(includedFileName, 'utf8', (err, fileStr)=>{
          if (err) {
            console.error(
              `FAILURE: There was an issue reading the file at `+
              `'${includedFileName}', which was included in the template.`
            );
            throw err;
          }
          outputTokens[i] = fileStr.replace(/[\r\n]+$/, '');
          finishTask();
        });
        break;
      } //Close case: 'file'
      case 'date':
        outputTokens[i] = dateFormatter().format(token.argument);
        break;
      case 'dev-refresh':
      //TODO: Use a proper auto-refresher instead of this
        outputTokens[i] = TEMPLATE_STRINGS.devRefreshScript;
        break;
      case 'edit-warning':
        outputTokens[i] = TEMPLATE_STRINGS.editWarning;
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

/* A function for chaining together asynchronous functions using callbacks.
 * The parameters are the functions to be chained, in the order of execution
 * (outermost to innermost): */
function callbackCompose(...funcs) {
  const callbackBind = (func, callback)=>{
    return (...args)=>func(...args, callback);
  };
  let i = funcs.length-1;
  let chain = funcs[i];
  while (i > 0) {
    --i;
    chain = callbackBind(funcs[i], chain);
  }
  return chain;
}

/* Create actual compilation sequence: */
const compileTemplate = callbackCompose(
  function readTemplateFile(fileName, cb) {
    fs.readFile(fileName, 'utf8', cb);
  },
  function generateOutputStr(err, templateStr, cb) {
    /* If there was an error reading the template-file: */
    if (err) {
      throw err;
    }

    /* Break the template string into an array of tokens: */
    const tplTokens = lexTemplate(templateStr);

    /* Do any (a)synchronous work needed to replace every <template></template>
     * element in the template file string: */
    replaceTemplates(tplTokens, cb);
  },
  function doWithOutputStr(outputStr) {
    const newFilePreview = (outputStr
      .substr(0, 500)
      .replace(/[\r\n]+/g, '$&\t')
    );

    /* When the `--validate` flag is passed to this program in the command line,
     * Do not write to that file. Instead, check that the existing output file
     * matches the output generated by the current template file. If it does,
     * exit normally. Otherwise, exit with an error code: */
    if (argv.validate) {
      fs.readFile(argOutputPath, 'utf8', function(err, existingOutputStr) {
        /* If there was an error reading the existing output file: */
        if (err) {
          if (err.code === 'ENOENT') {
            process.exitCode = 1;
            console.error(`INVALID: Could not find a file at '${argOutputPath}'.`);
          }
          throw err;
        }
        if (existingOutputStr === outputStr) {
          process.exitCode = 0; //Success
          console.log(
            `VALID: The file at '${argOutputPath}' matches the output of `+
            `compiling the template file at '${argv.templatePath}'.`
          );
        } else {
          process.exitCode = 1; //Failure
          console.error(
            `INVALID: The file at '${argOutputPath}' failed to match the `+
            `output of compiling the template file at '${argv.templatePath}'.\n`+
            `Please check that no manual changes have been made to `+
            `'${argOutputPath}', then run this command to compile the `+
            `template:\n\tnode compileTemplate `+
            `"${argv.templatePath}" "${argOutputPath}".`
          );
        }
      });
    }
    /* If the `--validate` flag is NOT specified, simply write the output string
     * to the file at the assumed or specified output path. */
    else {
      console.log(
        `Here's a preview of the replaced template:\n\t${newFilePreview}`
      );
      fs.writeFile(argOutputPath, outputStr, 'utf8', (err)=>{
        if(err) console.log(err);
      });
    }
  }
);

/* If the --watch flag is set, repeatedly compile the template any time the
 * template file or any of it's included files are changed: */
if (tplWatcher) {
  tplWatcher.on('change', (/*path*/)=>compileTemplate(argv.templatePath));
}

/* Execute the compilation sequence: */
compileTemplate(argv.templatePath);
