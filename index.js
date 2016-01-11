import Busboy from 'busboy';
//import Channel from 'async-csp';
import fs from 'fs';
import os from 'os';
import path from 'path';

module.exports = function (request, options) {
  options = options || {}
  options.headers = request.headers
  const busboy = new Busboy(options)

  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];

    request.on('close', cleanup)

    busboy
      .on('field', onField.bind(null, fields))
      .on('file', onFile.bind(null, files))
      .on('close', cleanup)
      .on('error', onEnd)
      .on('finish', onEnd)

    busboy.on('partsLimit', function(){
      const err = new Error('Reach parts limit')
      err.code = 'Request_parts_limit'
      err.status = 413
      onError(err)
    })

    busboy.on('filesLimit', function(){
      const err = new Error('Reach files limit')
      err.code = 'Request_files_limit'
      err.status = 413
      onError(err)
    })

    busboy.on('fieldsLimit', function(){
      const err = new Error('Reach fields limit')
      err.code = 'Request_fields_limit'
      err.status = 413
      onError(err)
    })

    busboy.on('finish', function(){
      resolve({fields, files})
    })

    request.pipe(busboy)
  })

  function onError(err) {
    cleanup();
    Promise.reject(err);
  }

  function onEnd(err) {
    cleanup();
  }

  function cleanup() {
    request.removeListener('close', cleanup)
    busboy.removeListener('field', onField)
    busboy.removeListener('file', onFile)
    busboy.removeListener('close', cleanup)
    busboy.removeListener('error', onEnd)
    busboy.removeListener('partsLimit', onEnd)
    busboy.removeListener('filesLimit', onEnd)
    busboy.removeListener('fieldsLimit', onEnd)
    busboy.removeListener('finish', onEnd)
  }
}

function onField(fields, name, val, fieldnameTruncated, valTruncated) {
  if (name.indexOf('[') > -1) {
    const obj = objectFromHierarchyArray(extractFormDataInputHierachy(name), val);
    reconcile(obj, fields);
  } else {
    fields[name] = val;
  }
}

function onFile(files, fieldname, file, filename, encoding, mimetype) {
  const tmpName = file.tmpName = new Date().getTime()  + fieldname  + filename;
  var saveTo = path.join(os.tmpDir(), path.basename(tmpName));
  file.pipe(fs.createWriteStream(saveTo));
  const readStream = fs.createReadStream(saveTo);
  readStream.fieldname = fieldname
  readStream.filename = filename
  readStream.transferEncoding = readStream.encoding = encoding
  readStream.mimeType = readStream.mime = mimetype;
  files.push(readStream);
}


/**
 * Extrat hierarchy from nested formData inputs
 * i.e. topLevel[sub1][sub2] => [topLevel, sub1, sub2]
 * @param  {[type]} string [description]
 * @return {[type]}        [description]
 */
 export const extractFormDataInputHierachy = (string) => {
  let arr = string.split('[');
  let first = arr.shift();
  let res = arr.map( v => v.split(']')[0] );
  res.unshift(first);
  return res
}

/**
 * Create an object given an array bluepint
 * i.e. [key1][key2][key3] => { key1: {key2: { key3: value }}};
 * @param  {[type]} arr   [description]
 * @param  {[type]} value [description]
 * @return {[type]}       [description]
 */
 export const objectFromHierarchyArray = (arr, value) => {
  value = value === EMPTY_ARRAY ? [] : value;
  return arr
    .reverse()
    .reduce((acc, next) => {
      return {[next]: acc}
    }, value)
}


export const reconcile = (obj, target) => {
  var key = Object.keys(obj)[0];
  if ( target.hasOwnProperty(key)) {
    return reconcile(obj[key], target[key])
  } else {
    return target[key] = obj[key];
  }
}