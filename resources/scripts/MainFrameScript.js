// FRAMESCRIPT
const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

// Globals
var core = {
	addon: {
		id: 'YNews!@jetpack',
		path: {
			name: 'ynews',
			scripts: 'chrome://ynews/content/resources/scripts/'
		},
		cache_key: 'v1.0' // set to version on release
	}
};
var l10n = {};
const NS_HTML = 'http://www.w3.org/1999/xhtml';
const TARGET_HOSTNAME = 'search.yahoo.com';
var SANDBOXES = {};
var last_sandbox_id = -1;

// start - addon functionalities
function domInsertOnReady(aContentWindow) {
	var aContentDocument = aContentWindow.document;
	
	if (aContentWindow.location.href.indexOf('/yhs/') == -1) {

		return;
	}
	
	var jumpStripContainer = aContentDocument.getElementById('vert-piv-tabs');
	
	if (!jumpStripContainer) {
		throw new Error('no jump strip container!');
	}
	
	var jumpStrip = jumpStripContainer.querySelector('ul');
	if (!jumpStrip) {
		throw new Error('no jump strip!');
	}
	
	var newHref = aContentWindow.location.href.replace('search.yahoo', 'news.search.yahoo').replace('/yhs/', '/');
	var newJumpTab = jsonToDOM([
		'li', {class:'priv007 ynews_at_jetpack', role:'tab'},
			['a', {href:newHref},
				l10n.news
			]
	], aContentDocument, {});
	
	jumpStrip.appendChild(newJumpTab);
	
	var anytimeTab = aContentDocument.getElementById('refiners-piv-tabs');
	var dummySpacer = jsonToDOM([
		'div', {class:'ynews_at_jetpack',style:'margin-left:60px;display:inline-block;'}
	], aContentDocument, null);
	anytimeTab.insertBefore(dummySpacer, anytimeTab.firstChild);
}

function doOnReady(aContentWindow) {

	if (aContentWindow.frameElement) {

		return;
	} else {
		// parent window loaded (not frame)
		if (aContentWindow.location.hostname == TARGET_HOSTNAME) {
			// ok target_hostname page ready, lets make sure its not an error page
			// check if got error loading page:
			var webnav = aContentWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation);
			var docuri = webnav.document.documentURI;

			if (docuri.indexOf('about:') == 0) {
				// target_hostname didnt really load, it was an error page

				// unregReason = 'error-loading';
				return;
			} else {
				// target_hostname actually loaded
				// target_hostnameReady = true;

				domInsertOnReady(aContentWindow);
				// ensureLoaded(aContentWindow); // :note: commented out as not needing content script right now
			}
		} else {

			return;
		}
	}
}

function onFullLoad(aSbId, aEvent) {
	var aContentWindow = aEvent.target.defaultView;
	if (aContentWindow == SANDBOXES[aSbId].contentWindowWeak.get()) {

		SANDBOXES[aSbId].unloaders.unFullLoader();
		injectContentScript(aSbId, aContentWindow);
	} else {

		return;
	}
}

function ensureLoaded(aContentWindow) {
	// only attached to target_hostname pages once idented as target_hostname
	// need to ensure loaded because jquery is needed by the content script
	

	
	last_sandbox_id++;
	var cSbId = last_sandbox_id;
	
	SANDBOXES[cSbId] = {
		unloaders: {}
	};
	SANDBOXES[cSbId].contentWindowWeak = Cu.getWeakReference(aContentWindow);
	
	var aContentDocument = aContentWindow.document;
	

	
	if (aContentDocument.readyState == 'complete') {

		injectContentScript(cSbId, aContentWindow);
	} else {

		var fullLoader = onFullLoad.bind(null, cSbId);
		SANDBOXES[cSbId].unloaders.unFullLoader = function() {
			delete SANDBOXES[cSbId].unloaders.unFullLoader;
			aContentWindow.removeEventListener('load', fullLoader, true);
		};
		aContentWindow.addEventListener('load', fullLoader, true); // need to wait for load, as need to wait for jquery $ to come in // need to use true otherwise load doesnt trigger
	}
}

function injectContentScript(aSbId, aContentWindow) {
	

	
	var aContentDocument = aContentWindow.document;
	
	var options = {
		sandboxPrototype: aContentWindow,
		wantXrays: false
	};
	var principal = docShell.chromeEventHandler.contentPrincipal; // aContentWindow.location.origin;

	
	SANDBOXES[aSbId].sb = Cu.Sandbox(principal, options);
	SANDBOXES[aSbId].unloaders.unSandbox = function() {

		delete SANDBOXES[aSbId].unloaders.unSandbox;
		

		
		Cu.nukeSandbox(SANDBOXES[aSbId].sb);
		
		
		for (var p in SANDBOXES[aSbId].unloaders) {
			SANDBOXES[aSbId].unloaders[p]();
		}
		
		delete SANDBOXES[aSbId];
	};
	
	var onBeforeUnload = function() {

		SANDBOXES[aSbId].unloaders.unOnBeforeUnload(); // i dont have to do this, as unSandbox runs all the unloaders, but i just do it for consistency so if i revisit this code in future i dont get confused
		SANDBOXES[aSbId].unloaders.unSandbox();
	};
	
	SANDBOXES[aSbId].unloaders.unOnBeforeUnload = function() {
		delete SANDBOXES[aSbId].unloaders.unOnBeforeUnload;
		aContentWindow.removeEventListener('beforeunload', onBeforeUnload, false);
	};
	
	aContentWindow.addEventListener('beforeunload', onBeforeUnload, false);
	

	Services.scriptloader.loadSubScript(core.addon.path.scripts + 'MainContentScript.js?' + core.addon.cache_key, SANDBOXES[aSbId].sb, 'UTF-8');
}
// end - addon functionalities

// start - server/framescript comm layer
// sendAsyncMessageWithCallback - rev3
var bootstrapCallbacks = { // can use whatever, but by default it uses this
	// put functions you want called by bootstrap/server here
	destroySelf: function() {
		removeEventListener('unload', fsUnloaded, false);
		removeEventListener('DOMContentLoaded', onPageReady, false);

		for (var aSbId in SANDBOXES) {
			if (SANDBOXES[aSbId].unloaders.unSandbox) {
				SANDBOXES[aSbId].unloaders.unSandbox(); // as this will run all the unloaders
			} else {
				for (var aUnloaderName in SANDBOXES[aSbId].unloaders) {
					SANDBOXES[aSbId].unloaders[aUnloaderName]();
				}
			}
		}

		contentMMFromContentWindow_Method2(content).removeMessageListener(core.addon.id, bootstrapMsgListener);
		

		if (content.location.hostname == TARGET_HOSTNAME) {

			var ynews_stuff = content.document.querySelectorAll('.ynews_at_jetpack');

			for (var i=0; i<ynews_stuff.length; i++) {
				ynews_stuff[i].parentNode.removeChild(ynews_stuff[i]);

			}
		}

	}
};
const SAM_CB_PREFIX = '_sam_gen_cb_';
var sam_last_cb_id = -1;
function sendAsyncMessageWithCallback(aMessageManager, aGroupId, aMessageArr, aCallbackScope, aCallback) {
	sam_last_cb_id++;
	var thisCallbackId = SAM_CB_PREFIX + sam_last_cb_id;
	aCallbackScope = aCallbackScope ? aCallbackScope : bootstrap; // :todo: figure out how to get global scope here, as bootstrap is undefined

	aCallbackScope[thisCallbackId] = function(aMessageArr) {
		delete aCallbackScope[thisCallbackId];
		aCallback.apply(null, aMessageArr);
	}
	aMessageArr.push(thisCallbackId);
	aMessageManager.sendAsyncMessage(aGroupId, aMessageArr);
}
var bootstrapMsgListener = {
	funcScope: bootstrapCallbacks,
	receiveMessage: function(aMsgEvent) {
		var aMsgEventData = aMsgEvent.data;

		// aMsgEvent.data should be an array, with first item being the unfction name in this.funcScope
		
		var callbackPendingId;
		if (typeof aMsgEventData[aMsgEventData.length-1] == 'string' && aMsgEventData[aMsgEventData.length-1].indexOf(SAM_CB_PREFIX) == 0) {
			callbackPendingId = aMsgEventData.pop();
		}
		
		var funcName = aMsgEventData.shift();
		if (funcName in this.funcScope) {
			var rez_fs_call = this.funcScope[funcName].apply(null, aMsgEventData);
			
			if (callbackPendingId) {
				// rez_fs_call must be an array or promise that resolves with an array
				if (rez_fs_call.constructor.name == 'Promise') {
					rez_fs_call.then(
						function(aVal) {
							// aVal must be an array
							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, aVal]);
						},
						function(aReason) {

							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, ['promise_rejected', aReason]]);
						}
					).catch(
						function(aCatch) {

							contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, ['promise_rejected', aCatch]]);
						}
					);
				} else {
					// assume array
					contentMMFromContentWindow_Method2(content).sendAsyncMessage(core.addon.id, [callbackPendingId, rez_fs_call]);
				}
			}
		}

		
	}
};
// end - server/framescript comm layer
// start - common helper functions
var gCFMM;
function contentMMFromContentWindow_Method2(aContentWindow) {
	if (!gCFMM) {
		gCFMM = aContentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
							  .getInterface(Ci.nsIDocShell)
							  .QueryInterface(Ci.nsIInterfaceRequestor)
							  .getInterface(Ci.nsIContentFrameMessageManager);
	}
	return gCFMM;

}
function Deferred() {
	try {
		/* A method to resolve the associated Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} value : This value is used to resolve the promise
		 * If the value is a Promise then the associated promise assumes the state
		 * of Promise passed as value.
		 */
		this.resolve = null;

		/* A method to reject the assocaited Promise with the value passed.
		 * If the promise is already settled it does nothing.
		 *
		 * @param {anything} reason: The reason for the rejection of the Promise.
		 * Generally its an Error object. If however a Promise is passed, then the Promise
		 * itself will be the reason for rejection no matter the state of the Promise.
		 */
		this.reject = null;

		/* A newly created Pomise object.
		 * Initially in pending state.
		 */
		this.promise = new Promise(function(resolve, reject) {
			this.resolve = resolve;
			this.reject = reject;
		}.bind(this));
		Object.freeze(this);
	} catch (ex) {

		throw new Error('Promise not available!');
	}
}
function jsonToDOM(json, doc, nodes) {

    var namespaces = {
        html: 'http://www.w3.org/1999/xhtml',
        xul: 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul'
    };
    var defaultNamespace = namespaces.html;

    function namespace(name) {
        var m = /^(?:(.*):)?(.*)$/.exec(name);        
        return [namespaces[m[1]], m[2]];
    }

    function tag(name, attr) {
        if (Array.isArray(name)) {
            var frag = doc.createDocumentFragment();
            Array.forEach(arguments, function (arg) {
                if (!Array.isArray(arg[0]))
                    frag.appendChild(tag.apply(null, arg));
                else
                    arg.forEach(function (arg) {
                        frag.appendChild(tag.apply(null, arg));
                    });
            });
            return frag;
        }

        var args = Array.slice(arguments, 2);
        var vals = namespace(name);
        var elem = doc.createElementNS(vals[0] || defaultNamespace, vals[1]);

        for (var key in attr) {
            var val = attr[key];
            if (nodes && key == 'key')
                nodes[val] = elem;

            vals = namespace(key);
            if (typeof val == 'function')
                elem.addEventListener(key.replace(/^on/, ''), val, false);
            else
                elem.setAttributeNS(vals[0] || '', vals[1], val);
        }
        args.forEach(function(e) {
            try {
                elem.appendChild(
                                    Object.prototype.toString.call(e) == '[object Array]'
                                    ?
                                        tag.apply(null, e)
                                    :
                                        e instanceof doc.defaultView.Node
                                        ?
                                            e
                                        :
                                            doc.createTextNode(e)
                                );
            } catch (ex) {
                elem.appendChild(doc.createTextNode(ex));
            }
        });
        return elem;
    }
    return tag.apply(null, json);
}
// end - common helper functions

// start - load unload stuff
function fsUnloaded() {
	// framescript on unload

	bootstrapCallbacks.destroySelf();

}
function onPageReady(aEvent) {
	var aContentWindow = aEvent.target.defaultView;

	doOnReady(aContentWindow);
}

function init() {

		contentMMFromContentWindow_Method2(content).addMessageListener(core.addon.id, bootstrapMsgListener);
		
		sendAsyncMessageWithCallback(contentMMFromContentWindow_Method2(content), core.addon.id, ['requestInit'], bootstrapMsgListener.funcScope, function(aData) {
			// core = aData.aCore;

			l10n = aData.aL10n

			
			addEventListener('unload', fsUnloaded, false);
			addEventListener('DOMContentLoaded', onPageReady, false);
			if (content.document.readyState == 'complete') {
				var fakeEvent = {
					target: {
						defaultView: content
					}
				}
				onPageReady(fakeEvent);
			}
		});
}

init();
// end - load unload stuff