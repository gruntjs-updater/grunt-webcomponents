'use strict';

var $ = require('cheerio');
var hackKey = 'dumb-cherio-hack';
var hackOpen = '<' + hackKey + '>';
var hackClose = '</' + hackKey + '>';
module.exports = function(grunt) {

	grunt.registerMultiTask('componentize', 'Precompiler for web components', function() {
		var options = this.options({
			punctuation: '.',
			separator: ', ',
			components: [],
			templateProperty: 'wc-tpl'
		});

		var done = this.async();

		var propExcl = ['children','lastChild','firstChild','next','prev','parent','root'];

		function logObject(obj, indent){
			indent = indent || 0;
			var ind = getIndent(indent);
			for(var j in obj){
				if(obj.hasOwnProperty(j)){			
					var t = typeof obj[j];
					glog(j + '=' + obj[j]);
				}
			}
		}

		function getIndent(size){
			var str = '';
			for(var i = 0; i < size; i++){
				str += ' ';
			}
			return str;
		}

		function glog(obj){
			grunt.log.writeln(obj);
		}

		function readFiles(files){
			var cpFiles = [];	
			for(var i = 0; i < files.length; i++){
				cpFiles.push({
					name: files[i],
					content: grunt.file.read(files[i])
				});
			}

			return cpFiles;
		}

		// Component loading
		function readComponents(files){	
			var output = [];
			for(var i = 0; i < files.length; i++){
				var cp = parseComponentFile(files[i].content);
				for(var j = 0; j < cp.length; j++){
					output.push(cp[j]);
				}
			}

			return output;
		}

		function parseComponentFile(filedata){
			var data = $.load(filedata);

			var cpCore = data('[' + options.templateProperty + ']');
			var cp = [];

			for(var i = 0; i < cpCore.length; i++){
				cp.push({
					name: cpCore[i].attribs[options.templateProperty],
					content: cpCore[i]
				});
			}

			return cp;		
		}

		function loadComponents(options){
			var files = readFiles(options.components);
			return readComponents(files);
		}

		var components = loadComponents(options);

		// Source file loading
		function readDom(files){
			var dom = [];
			for(var i = 0; i < files.length; i++){

				var obj = {
					fname: files[i].name,
					content: $.load(hackOpen + files[i].content + hackClose)(hackKey)[0]
				};

				dom.push(obj);
			}
			return dom;
		}

		function processDom(filedoms){
			var output = [];
			for(var i = 0; i < filedoms.length; i++){
				
				var fd = filedoms[i];

				glog('Processing file DOM for: ' + fd.fname);

				var trees = [];
				for(var j in fd.content.children){
					trees.push(processDomTree(fd.content.children[j]));
				}
				output.push({
					fname: fd.fname,
					content: trees
				});
			}

			return output;
		}

		function duplicate(obj){
			var newObj = {};
			for(var j in obj){
				if(exclude(j)){
					continue;
				}

				newObj[j] = obj[j];
			}
			return newObj;
		}

		function exclude(prop){
			for(var i = 0; i < propExcl.length; i++){
				if(prop === propExcl[i]){
					return true;
				}
			}
			return false;
		}

		function getComponent(name){
			for(var i = 0; i < components.length; i++){
				if(name === components[i].name){
					return components[i].content;
				}
			}
			return undefined;
		}

		function processTemplate(template, buildtemplate, content){
			buildtemplate.children = {};
			var contentCounter = 0;
			for(var i in template.children){
				var c = template.children[i];
				if(c.type === 'text'){
					buildtemplate.children[i] = duplicate(c);
				}
				else if(c.type === 'tag' && c.name === 'content'){
					buildtemplate.children[i] = {
						type: 'templateContent',
						children: []
					};

					for(var j in content){
						var processed = processDomTree(content[j]);
						if(content[j].name === 'logorow'){
							logObject(processed);
						}
						buildtemplate.children[i].children.push(processed);
					}
				}				
				else{
					buildtemplate.children[i] = processTemplate(c, duplicate(c), content);
				}
			}

			return buildtemplate;
		}

		function copyAttributes(to, from){
			var attributes = {};
			for(var j in from.attribs){
				attributes[j] = from.attribs[j];
			}

			to.attribs = attributes;
		}

		function processDomTree(filedom){
			var cp = getComponent(filedom.name);

			if(typeof cp !== 'undefined'){

				var buildtemplate = duplicate(cp);
				copyAttributes(buildtemplate, filedom);
				var a = processTemplate(cp, buildtemplate, filedom.children);

				if(a.name === 'tr'){
					//logObject(a.attribs);
				}

				return a;
			}

			var processedDom = duplicate(filedom);
			processedDom.children = {};

			for(var i in filedom.children){
				var fd = filedom.children[i];
				if(fd.type === 'text'){
					processedDom.children[i] = duplicate(fd);
				}
				else if(fd.type === 'tag'){
					processedDom.children[i] = processDomTree(fd);
				}
			}
			return processedDom;
		}

		function openTag(name, attributes){
			if(!attributes || attributes.length === 0){
				return '<' + name + '>';
			}
			else{
				var tag = '<' + name + '';
				for(var i in attributes){
					if(i === options.templateProperty){
						continue;
					}
					tag += ' ' + i + '="' + attributes[i] + '"';
				}				
				return tag + '>';
			}
		}

		function closeTag(name){
			return '</' + name + '>';
		}

		function createContent(content){
			if(content.type === 'text'){
				return content.data;
			}
			else if(content.type === 'directive'){
				return openTag(content.data, undefined);
			}
			else if(content.type === 'tag'){
				var result = openTag(content.name, content.attribs);
				for(var j in content.children){
					var c = content.children[j];
					if(c.type === 'templateContent'){
						for(var k in c.children){

							result += createContent(c.children[k]);
						}
					}
					else{
						result += createContent(content.children[j]);
					}
				}
				result += closeTag(content.name);
			}
			return result;
		}

		function rebuildFile(filedom){
			var buffer = '';
			for(var i = 0; i < filedom.content.length; i++){
				var content = filedom.content[i];
				buffer += createContent(content);

				grunt.file.write(filedom.fname, buffer);
			}
			return buffer;
		}


		this.files.forEach(function(f){		
			var files = readFiles(f.src);
			var dom = readDom(files);

			var output = processDom(dom);

			var textBuffers = [];

			grunt.file.setBase(f.dest);

			for(var i = 0; i < output.length; i++){
				rebuildFile(output[i]);
			}

			grunt.log.writeln('Files created: ' + i);
		});
	});
};
