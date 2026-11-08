document.addEventListener('DOMContentLoaded', function() {

    // console.log("DEBUG: psc_sync loading, context:", window.site_type);

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    }

    function setCookie(name, value, days) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString(); // days to milliseconds to calculate timestamp
        // document.cookie = `${name}=${encodeURIComponent(value)};${expires} SameSite=Strict`;
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; SameSite=Strict`;
    }

    // TODO: migrate to cc.onChange. must capture all the the cookie data (inc expiry)
    const siteType = window.site_type;

    if(siteType != 'w'){
        // country or event
        const iframe = document.getElementById('iframe');

        // when the iframe is ready, and parent cookie changes then send to global
        iframe.onload = function () {
            if ('cookieStore' in window && cookieStore.addEventListener) {
                cookieStore.addEventListener('change', (event) => {
                    for (const changeChanged of event.changed) {
                        if (changeChanged.name === 'psc') {
                            iframe.contentWindow.postMessage( { name: 'psc', value: changeChanged.value}, '*'); // target origin must match
                        }
                    }
                    // for (const deletion of event.deleted) {
                    //     if (deletion.name === 'psc') {
                    //         iframe.contentWindow.postMessage( { name: 'psc', data: null}, '*');
                    //     }
                    // }
                });
            }
        }
    }

    // listen for incoming message (on all site types),
    // if the incoming timestamp is more recent then update this cookie
    window.onmessage = function(e) {
        if (e.data.name == 'psc' && e.data.value) {
            
            var iv = JSON.parse(decodeURIComponent(e.data.value));
            
            var it = new Date(iv.lastConsentTimestamp ?? 'now').getTime();
            
            // get lastConsentTimestamp for current domain, and incoming
            var cv = getCookie('psc');
            
            if(cv == undefined){
                var ct = 0;
            } else {
                var ct = JSON.parse(getCookie('psc')).lastConsentTimestamp;
                ct = new Date(ct ?? 'now').getTime();
            }

            if (it > ct) {
                setCookie('psc', JSON.stringify(iv), 182)
            }

        }
    }

    // console.log("DEBUG: psc_sync loaded, context:", window.site_type);

});