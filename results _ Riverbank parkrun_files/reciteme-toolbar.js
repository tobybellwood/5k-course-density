/**
 * ReciteMe Toolbar - Main JavaScript
 * Version 2.4.1
 * Configuration is passed from WordPress via wp_localize_script
 */

// Set up global error handler FIRST, before anything else
(function() {
    'use strict';
    
    var originalErrorHandler = window.onerror;

    // Catch all errors from ReciteMe's third-party script
    window.onerror = function(message, source, lineno, colno, error) {
        // Check if error is from ReciteMe API or is the style property error
        var isReciteMe = (source && source.indexOf('api.reciteme.com') !== -1) ||
                         (source && source.indexOf('reciteme.com') !== -1) ||
                         (error && error.stack && error.stack.indexOf('reciteme') !== -1) ||
                         (message && typeof message === 'string' && message.toLowerCase().indexOf('recite') !== -1) ||
                         // Catch the specific mobile error
                         (message && typeof message === 'string' && 
                          (message.indexOf("Cannot read properties of undefined (reading 'style')") !== -1 ||
                           message.indexOf("Cannot read property 'style'") !== -1));
        
        if (isReciteMe) {
            return true; // Suppress ReciteMe errors
        }
        
        // Call original handler for other errors
        if (originalErrorHandler) {
            return originalErrorHandler.apply(this, arguments);
        }
        return false;
    };

    // Also handle unhandled promise rejections
    var originalRejectionHandler = window.onunhandledrejection;
    window.onunhandledrejection = function(event) {
        var isReciteMe = (event.reason && event.reason.stack && 
                         (event.reason.stack.indexOf('reciteme') !== -1 || 
                          event.reason.stack.indexOf('api.reciteme.com') !== -1)) ||
                         (event.reason && event.reason.message && 
                          (event.reason.message.toLowerCase().indexOf('recite') !== -1 ||
                           event.reason.message.indexOf("Cannot read properties of undefined (reading 'style')") !== -1));
        
        if (isReciteMe) {
            event.preventDefault();
            return true;
        }

        if (originalRejectionHandler) {
            return originalRejectionHandler.apply(this, arguments);
        }
    };
})();

(function() {
    'use strict';

    // Verify configuration exists
    if (typeof reciteMeConfig === 'undefined') {
        return;
    }

    var config = reciteMeConfig;
    var reciteIsLoaded = [];
    var reciteMeButton = null;
    var reciteLoading = false;

    /**
     * Load a script dynamically
     */
    function loadReciteScript(src, callback) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;

        script.onerror = function(error) {
            if (callback) {
                callback();
            }
        };

        if (script.readyState) {
            // IE
            script.onreadystatechange = function() {
                if (script.readyState === 'loaded' || script.readyState === 'complete') {
                    script.onreadystatechange = null;
                    if (callback) {
                        callback();
                    }
                }
            };
        } else {
            // Others
            script.onload = function() {
                if (callback) {
                    callback();
                }
            };
        }

        script.src = src;
        document.head.appendChild(script);
    }

    /**
     * Get a cookie value
     */
    function getCookie(name) {
        name += '=';
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.indexOf(name) === 0) {
                return cookie.substring(name.length);
            }
        }
        return null;
    }

    /**
     * Detect if we're in mobile mode
     */
    function isMobile() {
        return window.innerWidth <= 768 || 
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Create placeholder elements that ReciteMe expects but don't exist on mobile
     */
    function createMobilePlaceholders() {
        if (!isMobile()) return;
        
        console.log('Creating mobile placeholder elements for ReciteMe');
        
        // Create .recite-enable if it doesn't exist
        if (!document.querySelector('.recite-enable')) {
            var enableDiv = document.createElement('div');
            enableDiv.className = 'recite-enable';
            enableDiv.style.display = 'none';
            document.body.appendChild(enableDiv);
            console.log('✅ Created .recite-enable placeholder');
        }
        
        // Create .recite-sprite-button-magnifier if it doesn't exist
        if (!document.querySelector('.recite-sprite-button-magnifier')) {
            var magnifierDiv = document.createElement('div');
            magnifierDiv.className = 'recite-sprite-button-magnifier';
            magnifierDiv.style.display = 'none';
            document.body.appendChild(magnifierDiv);
            console.log('✅ Created .recite-sprite-button-magnifier placeholder');
        }
    }

    /**
     * Load the ReciteMe service
     */
    function loadReciteService(callback) {
        var serviceUrl = config.serviceUrl + config.serviceKey;

        // Ensure DOM is ready - extra checks for mobile
        if (!document.body || !document.head || !document.documentElement) {
            setTimeout(function() {
                loadReciteService(callback);
            }, 100);
            return;
        }

        // Additional mobile-specific DOM readiness check
        if (isMobile() && document.readyState !== 'complete') {
            setTimeout(function() {
                loadReciteService(callback);
            }, 200);
            return;
        }

        // Check if already loaded
        for (var i = 0; i < reciteIsLoaded.length; i++) {
            if (reciteIsLoaded[i] === serviceUrl) {
                if (callback) {
                    callback();
                }
                return;
            }
        }

        reciteIsLoaded.push(serviceUrl);

        // Create placeholder elements for mobile BEFORE loading ReciteMe script
        createMobilePlaceholders();

        loadReciteScript(serviceUrl, function() {
            // Small delay to ensure placeholders are in DOM
            var loadDelay = isMobile() ? 100 : 0;
            
            setTimeout(function() {
                try {
                    if (typeof _reciteLoaded === 'function') {
                        _reciteLoaded();
                    }
                    if (callback) {
                        callback();
                    }
                    if (typeof Recite !== 'undefined') {
                        Recite.load(config.options);
                        Recite.Event.subscribe('Recite:load', function() {
                            Recite.enable();
                            updateToolbarOffset();
                        });
                    }
                } catch (e) {
                    // Silently handle errors
                }
            }, loadDelay);
        });
    }

    /**
     * Create the floating button
     */
    function createReciteButton() {
        if (!document.body) {
            return;
        }
        
        var buttonContainer = document.createElement('a');
        buttonContainer.href = '#launchRecite';
        buttonContainer.id = 'reciteme-button';
        buttonContainer.setAttribute('role', 'button');
        buttonContainer.setAttribute('alt', 'Recite Me accessibility and Language Support');
        buttonContainer.setAttribute('title', 'Launch Recite Me');

        var buttonImage = document.createElement('img');
        buttonImage.src = config.buttonImageUrl;
        buttonImage.alt = 'Recite Me accessibility and Language Support';
        buttonImage.title = 'Launch Recite Me';

        buttonContainer.appendChild(buttonImage);
        document.body.prepend(buttonContainer);

        // Click handler
        buttonContainer.addEventListener('click', function(e) {
            e.preventDefault();
            loadReciteService();
            return false;
        });

        // Hover handlers
        buttonContainer.addEventListener('mouseover', function() {
            buttonImage.src = config.buttonImageHoverUrl;
        });

        buttonContainer.addEventListener('mouseout', function() {
            buttonImage.src = config.buttonImageUrl;
        });

        reciteMeButton = buttonContainer;

        // Add CSS styling
        var style = document.createElement('style');
        style.innerHTML = '#reciteme-button { ' +
            'background: rgb(255, 163, 0); ' +
            'width: 64px; ' +
            'height: 64px; ' +
            'position: fixed; ' +
            'border-radius: 20px; ' +
            'z-index: 10000; ' +
            'cursor: pointer; ' +
            'box-shadow: rgba(36, 36, 36, 0.15) 0px 20px 30px 0px; ' +
            config.buttonStyle +
            '} ' +
            '#reciteme-button:hover { background: #e9322e; } ' +
            '#reciteme-button img { ' +
            'width: 36px; ' +
            'height: 36px; ' +
            'position: absolute; ' +
            'top: 50%; ' +
            'left: 50%; ' +
            'transform: translate(-50%, -50%); ' +
            '}';
        document.head.appendChild(style);
    }

    /**
     * Initialize ReciteMe
     */
    function loadReciteMe() {
        // Check if auto-load was previously enabled
        if (getCookie('Recite.Persist') === 'true') {
            loadReciteService();
        }

        // Auto-launch if configured
        if (config.autoLaunch && getCookie('Recite.Persist') !== 'false') {
            loadReciteService();
        }

        // Check for hash-based enable
        if (window.location.hash === '#reciteEnable') {
            loadReciteService();
        }

        // Attach click handlers to launch selector elements
        var launchButtons = document.querySelectorAll(config.launchSelector);
        for (var i = 0; i < launchButtons.length; i++) {
            launchButtons[i].addEventListener('click', function() {
                var storedLang = localStorage.getItem('user_lang');
                if (storedLang) {
                    localStorage.setItem('launch_language', storedLang);
                }
                loadReciteService();
            });
        }
    }

    /**
     * Handle language translation
     */
    function handleTranslation(lang) {
        if (!lang || lang === 'null' || lang === getDocLang()) {
            return;
        }

        if (typeof Recite !== 'undefined') {
            reciteLoading = false;
            localStorage.setItem('user_lang', lang);
            Recite.Language.Translate.translate(document.body, lang);
            if (Recite.isEnabled()) {
                Recite.Preferences.set('language', lang);
            }
        } else if (!reciteLoading) {
            loadAndTranslate(lang);
        }
    }

    /**
     * Load ReciteMe and translate
     */
    function loadAndTranslate(lang) {
        reciteLoading = true;
        loadReciteScript(config.serviceUrl + config.serviceKey, function() {
            handleTranslation(lang);
        });
    }

    /**
     * Get the document's default language
     */
    function getDocLang() {
        var html = document.documentElement;
        if (html.lang) {
            return html.lang;
        }
        return null;
    }

    /**
     * Sync language preference
     */
    function syncLanguage() {
        if (typeof Recite === 'undefined') {
            return;
        }
        var lang = Recite.Preferences.get('language');
        var storedLang = localStorage.getItem('user_lang');
        if (lang !== storedLang) {
            localStorage.setItem('user_lang', lang);
        }
    }

    /**
     * Reset language on close
     */
    function resetLang() {
        var launchLang = localStorage.getItem('launch_language');
        if (launchLang) {
            localStorage.setItem('user_lang', launchLang);
        } else {
            localStorage.removeItem('user_lang');
        }
    }

    /**
     * Create placeholder elements that ReciteMe expects but don't exist on mobile
     */
    function createMobilePlaceholders() {
        if (!isMobile()) return;
        
        console.log('Creating mobile placeholder elements for ReciteMe');
        
        // Create .recite-enable if it doesn't exist
        if (!document.querySelector('.recite-enable')) {
            var enableDiv = document.createElement('div');
            enableDiv.className = 'recite-enable';
            enableDiv.style.display = 'none';
            document.body.appendChild(enableDiv);
            console.log('✅ Created .recite-enable placeholder');
        }
        
        // Create .recite-sprite-button-magnifier if it doesn't exist
        if (!document.querySelector('.recite-sprite-button-magnifier')) {
            var magnifierDiv = document.createElement('div');
            magnifierDiv.className = 'recite-sprite-button-magnifier';
            magnifierDiv.style.display = 'none';
            document.body.appendChild(magnifierDiv);
            console.log('✅ Created .recite-sprite-button-magnifier placeholder');
        }
    }

    /**
     * Called when ReciteMe is loaded
     */
    window._reciteLoaded = function() {
        // Create missing mobile elements BEFORE ReciteMe tries to access them
        createMobilePlaceholders();
        
        try {
            if (typeof Recite !== 'undefined') {
                Recite.Event.subscribe('Recite:disable', resetLang);
            }

            // Remove any existing floating button
            var oldButton = document.getElementById('reciteme-button');
            if (oldButton && oldButton !== reciteMeButton) {
                oldButton.remove();
            }

            // Execute custom loaded code
            if (config.loadedCode) {
                try {
                    eval(config.loadedCode);
                } catch (e) {
                    console.error('Error executing loaded code:', e);
                }
            }

            if (typeof Recite !== 'undefined' && Recite.Event) {
                Recite.Event.subscribe("Controls:loaded", function () {
                  try {
                      if(document.querySelector('html')){
                        document.querySelector('html').prepend(document.querySelector('#recite-header'));
                    }

                    var closeButton = document.querySelector("#recite-close");
                    if (closeButton) {
                      closeButton.addEventListener("click", function () {
                        setTimeout(function () {
                          var html = document.querySelector("html");
                          var modal = document.querySelector("#recite-modal");
                          if (html && modal) {
                            html.prepend(modal);
                          }
                        }, 200);
                      });
                    }
                    var wrapper = document.querySelector("#recite-wrapper");
                    if (wrapper && wrapper.style) {
                      wrapper.style.width = "100%";
                    }
                    // Update CSS variable when toolbar is present
                    updateToolbarOffset();
                  } catch (e) {
                    // Silently handle errors
                  }
                });

                // Also listen for when toolbar is disabled
                Recite.Event.subscribe("Recite:disable", function() {
                  updateToolbarOffset();
                });
            }
        } catch (e) {
            console.error('Error in _reciteLoaded:', e);
        }
    };

    /**
     * Update CSS variable for ReciteMe toolbar offset
     */
    function updateToolbarOffset() {
        setTimeout(function() {
            try {
                var toolbar = document.querySelector('#recite-header');
                var toolbarHeight = toolbar && toolbar.offsetHeight ? toolbar.offsetHeight : 0;
                
                // Ensure documentElement exists and has required methods
                if (!document.documentElement || !document.documentElement.style) {
                    return;
                }
                
                // Set CSS custom property on root element
                document.documentElement.style.setProperty('--reciteme-offset', toolbarHeight + 'px');
                
                // Add/remove class to indicate toolbar is active
                if (toolbarHeight > 0) {
                    document.documentElement.classList.add('reciteme-active');
                } else {
                    document.documentElement.classList.remove('reciteme-active');
                }
            } catch (e) {
                console.error('Error updating toolbar offset:', e);
            }
        }, 100);
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            loadReciteMe();

            if (config.floatingButton) {
                createReciteButton();
            }
        });
    } else {
        loadReciteMe();

        if (config.floatingButton) {
            createReciteButton();
        }
    }

    // Handle data-translate buttons
    var translateButtons = document.querySelectorAll('[data-translate]');
    for (var i = 0; i < translateButtons.length; i++) {
        translateButtons[i].addEventListener('click', function(e) {
            var langCode = this.getAttribute('data-translate');
            if (langCode) {
                handleTranslation(langCode);
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    // Check for and handle stored language
    if (getCookie('Recite.Persist') !== 'false' && getCookie('Recite.Persist') !== null) {
        var storedLang = localStorage.getItem('user_lang');
        if (storedLang && storedLang !== 'undefined') {
            handleTranslation(storedLang);
        }
    }

    // Execute preload code
    if (config.preloadCode) {
        try {
            eval(config.preloadCode);
        } catch (e) {
            console.error('Error executing preload code:', e);
        }
    }
})();
