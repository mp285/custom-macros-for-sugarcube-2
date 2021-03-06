// fs.js v1.0.0; for SugarCube 2, by chapel

(function () {
    
    // core functions
    
    function bail (err) {
        console.error(err);
        return null;
    }
    
    function stringify (o) {
        try {
            return JSON.stringify(o);
        } catch (err) {
            return bail(err);
        }
    }
    
    function b64ify (objOrStr) {
        try {
            var str;
            if (objOrStr === undefined) {
                return null;
            } else if (typeof objOrStr !== 'string') {
                str = stringify(objOrStr);
            } else {
                str = objOrStr;
            }
            if (str != null) {
                return LZString.compressToBase64(str);
            }
        } catch (err) {
            return bail(err);
        }
    }
    
    function decompressB64 (data) {
        try {
            return LZString.decompressFromBase64(data);
        } catch (err) {
            return bail(err);
        }
    }
    
    function parse (data) {
        try {
            return JSON.parse(data);
        } catch (err) {
            try {
                return JSON.parse(decompressB64(data));
            } catch (err) {
                return bail(err);
            }
        }
    }
    
    function saveToState (objOrStr, varName) {
        try {
            if (varName[0] !== '$' && varName[0] !== '_') {
                throw new Error('Invalid stateful variable');
            }
            if (State.setVar) {
                State.setVar(varName, clone(objOrStr));
            } else {
                if (varName[0] === '$') {
                    State.variables[varName.substr(1)] = clone(objOrStr);
                } else {
                    State.temporary[varName.substr(1)] = clone(objOrStr);
                }
            }
        } catch (err) {
            return bail(err);
        }
    }
    
    function saveToFile (fileName, data) {
        if (typeof data !== 'string') {
            data = stringify(data);
        }
        if (data == null) {
            return;
        }
        if (!fileName || typeof fileName !== 'string') {
            fileName = 'file.twinedata';
        } else {
            fileName = Util.slugify(fileName.trim()).toLowerCase();
        }
        if (!fileName.includes('.')) {
            fileName = fileName + '.twinedata';
        }
        try {
            saveAs(new Blob([data], { type : 'text/plain;charset=UTF-8'}), fileName);
        } catch (err) {
            return bail(err);
        }
    }
    
    function readData (dataType, data) {
        if (data == null) {
            return null;
        }
        switch (dataType) {
            case 'json':
                return parse(data);
            case 'base64':
            case 'b64':
            case '64':
                return parse(decompressB64(data));
            default:
                return data;
        }
    }
    
    function loadFromFile (e) {
        var file = e.target.files[0],
            reader = new FileReader(),
            storyVar = e.storyVar || '$fileData',
            dataType = e.dataType || 'text';
        
        $(reader).on('load', function (event) {
            try {
                var target = event.currentTarget;
                if (!target.result) {
                    return;
                }
                
                var data = readData(dataType, target.result);
                
                saveToState(data, storyVar);
                
            } catch (err) {
                return bail(err);
            }
        });
        
        reader.readAsText(file);
    }
    
    function createImportButton (text, storyVar, dataType, asLink) {
        var $btn = $(document.createElement(asLink ? 'a' : 'button'))
                .wiki(text),
            $label = $(document.createElement('label'))
                .attr('for', 'file-import')
                .addClass('upload-file')
                .append($btn),
            $input = $(document.createElement('input'))
                .attr({
                    id : 'file-import',
                    type : 'file',
                    'data-format' : dataType
                }).css('display', 'none').on('change', function (e) {
                    var ev = Object.assign(clone(e), {
                        storyVar : storyVar,
                        dataType : $(this).attr('data-format')
                    });
                    loadFromFile(ev);
                }),
            $wrapper = $(document.createElement('span'))
                .append($label, $input);
        
        $btn.ariaClick(function () {
            $label.trigger('click');
        });
        
        return $wrapper;
    }
    
    function exportToFile (data, fileName, dataType) {
        var str;
        switch (dataType) {
            case 'json':
                str = stringify(data);
                break;
            case 'base64':
            case 'b64':
            case '64':
                str = b64ify(stringify(data) || data);
                break;
            default:
                str = (typeof data === 'string') ? data : stringify(data);
        }
        saveToFile(fileName, str);
    }
    
    function importFromFile (targetOnPage, text, storyVar, dataType, asLink) {
        var $importElement = createImportButton(text, storyVar, dataType, asLink),
            target;
        if (targetOnPage && typeof targetOnPage === 'string') {
            target = $(targetOnPage);
        } else if (targetOnPage) {
            target = targetOnPage;
        } else {
            target = '#passages';
        }
        
        $importElement.appendTo(target);
    }
    
    // setup API
    
    setup.fileSystem = {
        config : {
            defaultText : 'Import',
            renderAsLink : false
        },
        JSON : {
            stringify : stringify,
            parse : parse
        }, 
        b64 : {
            compress : b64ify,
            decompress : decompressB64
        }, 
        toState : saveToState,
        toFile : saveToFile,
        fromFile : loadFromFile
    };
    
    // global API
    
    window.Chapel = window.Chapel || {};
    Chapel.fileSystem = Chapel.fileSystem || setup.fileSystem;
    
    // macros
    
    Macro.add('import', {
        handler : function () {
            
            var target = this.output,
                linkText = this.args[2], 
                storyVar = this.args[0], 
                dataType = this.args[1];
            
            if (!linkText || typeof linkText !== 'string') {
                linkText = setup.fileSystem.config.defaultText;
            }
            if (!storyVar || typeof storyVar !== 'string' || (storyVar[0] !== '$' && storyVar[0] !== '_')) {
                return this.error('Invalid variable name.');
            }
            if (!dataType || typeof dataType !== 'string') {
                dataType = 'text';
            } else {
                dataType = dataType.trim();
            }
            importFromFile(target, linkText, storyVar, dataType, setup.fileSystem.config.renderAsLink);
            
        }
    });
    
    Macro.add('export', {
        handler : function () {
            
            var data = this.args[0],
                file = this.args[1],
                type = this.args[2];
            
            if (!data) {
                return this.error('No data to save...');
            }
            if (!type || typeof type !== 'string') {
                type = 'text';
            } else {
                type = type.trim();
            }
            if (!file || typeof file !== 'string') {
                file = 'file.twinedata';
            } else {
                file = file.trim();
            }
            
            exportToFile(data, file, type);
            
        }
    });
}());