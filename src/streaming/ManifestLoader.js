/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
MediaPlayer.dependencies.ManifestLoader = function () {
    "use strict";

    var RETRY_ATTEMPTS = 3,
        RETRY_INTERVAL = 500,
        parseBaseUrl = function (url) {
            var base = "";

            if (url.indexOf("/") !== -1) {
                if (url.indexOf("?") !== -1) {
                    url = url.substring(0, url.indexOf("?"));
                }
                base = url.substring(0, url.lastIndexOf("/") + 1);
            }

            return base;
        },

        doLoad = function (url, remainingAttempts) {
            var baseUrl = parseBaseUrl(url),
                request = new XMLHttpRequest(),
                requestTime = new Date(),
                needFailureReport = true,
                manifest,
                onload,
                report,
                progress,
                firstProgressCall,
                lastTraceTime = requestTime,
                lastTraceReceivedCount = 0,
                traces = [],
                self = this;

            onload = function () {
                var actualUrl = null,
                    errorMsg,
                    loadedTime = new Date();

                if (request.status < 200 || request.status > 299) {
                    return;
                }

                needFailureReport = false;

                // Handle redirects for the MPD - as per RFC3986 Section 5.1.3
                if (request.responseURL && request.responseURL !== url) {
                    baseUrl = parseBaseUrl(request.responseURL);
                    actualUrl = request.responseURL;
                }

                self.metricsModel.addHttpRequest("stream",
                                                 null,
                                                 MediaPlayer.vo.metrics.HTTPRequest.MPD_TYPE,
                                                 url,
                                                 actualUrl,
                                                 null,
                                                 requestTime,
                                                 request.firstByteDate || null,
                                                 loadedTime,
                                                 request.status,
                                                 null,
                                                 request.getAllResponseHeaders(),
                                                 traces);

                manifest = self.parser.parse(request.responseText, baseUrl, self.xlinkController);

                if (manifest) {
                    manifest.url = actualUrl || url;
                    manifest.loadedTime = loadedTime;
                    self.metricsModel.addManifestUpdate("stream", manifest.type, requestTime, loadedTime, manifest.availabilityStartTime);
                    self.xlinkController.resolveManifestOnLoad(manifest);
                } else {
                    errorMsg = "Failed loading manifest: " + url + ", parsing failed";

                    self.notify(
                        MediaPlayer.dependencies.ManifestLoader.eventList.ENAME_MANIFEST_LOADED,
                        {
                            manifest: null
                        },
                        new MediaPlayer.vo.Error(
                            MediaPlayer.dependencies.ManifestLoader.PARSERERROR_ERROR_CODE,
                            errorMsg,
                            null
                        )
                    );

                    self.log(errorMsg);
                }
            };

            report = function () {
                if (!needFailureReport) {
                    return;
                }
                needFailureReport = false;

                self.metricsModel.addHttpRequest("stream",
                                                 null,
                                                 MediaPlayer.vo.metrics.HTTPRequest.MPD_TYPE,
                                                 url,
                                                 request.responseURL || null,
                                                 null,
                                                 requestTime,
                                                 request.firstByteDate || null,
                                                 new Date(),
                                                 request.status,
                                                 null,
                                                 request.getAllResponseHeaders(),
                                                 null);

                if (remainingAttempts > 0) {
                    self.log("Failed loading manifest: " + url + ", retry in " + RETRY_INTERVAL + "ms" + " attempts: " + remainingAttempts);
                    remainingAttempts--;
                    setTimeout(function () {
                        doLoad.call(self, url, remainingAttempts);
                    }, RETRY_INTERVAL);
                } else {
                    self.log("Failed loading manifest: " + url + " no retry attempts left");
                    self.errHandler.downloadError("manifest", url, request);
                    self.notify(MediaPlayer.dependencies.ManifestLoader.eventList.ENAME_MANIFEST_LOADED, null, new Error("Failed loading manifest: " + url + " no retry attempts left"));
                }
            };

            progress = function (event) {
                var currentTime = new Date();

                if (firstProgressCall) {
                    firstProgressCall = false;
                    if (!event.lengthComputable || (event.lengthComputable && event.total !== event.loaded)) {
                        request.firstByteDate = currentTime;
                    }
                }

                traces.push({
                    s: lastTraceTime,
                    d: currentTime.getTime() - lastTraceTime.getTime(),
                    b: [event.loaded ? event.loaded - lastTraceReceivedCount : 0]
                });

                lastTraceTime = currentTime;
                lastTraceReceivedCount = event.loaded;
            };

            try {
                //this.log("Start loading manifest: " + url);
                request.onload = onload;
                request.onloadend = report;
                request.onerror = report;
                request.onprogress = progress;
                request.open("GET", self.requestModifierExt.modifyRequestURL(url), true);
                request.send();
            } catch (e) {
                request.onerror();
            }
        },
        onXlinkReady = function (event) {
            this.notify(MediaPlayer.dependencies.ManifestLoader.eventList.ENAME_MANIFEST_LOADED, {manifest: event.data.manifest});
        };

    return {
        log: undefined,
        parser: undefined,
        errHandler: undefined,
        metricsModel: undefined,
        requestModifierExt: undefined,
        notify: undefined,
        subscribe: undefined,
        unsubscribe: undefined,
        system: undefined,

        load: function (url) {
            doLoad.call(this, url, RETRY_ATTEMPTS);
        },
        setup: function () {
            onXlinkReady = onXlinkReady.bind(this);
            this.xlinkController = this.system.getObject("xlinkController");
            this.xlinkController.subscribe(MediaPlayer.dependencies.XlinkController.eventList.ENAME_XLINK_READY, this, onXlinkReady);
        }
    };
};

MediaPlayer.dependencies.ManifestLoader.prototype = {
    constructor: MediaPlayer.dependencies.ManifestLoader
};

MediaPlayer.dependencies.ManifestLoader.PARSERERROR_ERROR_CODE = 1;

MediaPlayer.dependencies.ManifestLoader.eventList = {
    ENAME_MANIFEST_LOADED: "manifestLoaded"
};
