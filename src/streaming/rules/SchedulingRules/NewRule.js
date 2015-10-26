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


MediaPlayer.rules.VideoSkimmingRule = function () {
    "use strict";

    var seekTarget = {},
        scheduleController = {},

        onPlaybackSeeking = function(e) {
            // TODO this a dirty workaround to call this handler after a handelr from ScheduleController class. That
            // handler calls FragmentModel.cancelPendingRequests(). We should cancel pending requests before we start
            // creating requests for a seeking time.
            setTimeout(function() {
                var time = e.data.seekTime;
                seekTarget.audio = time;
                seekTarget.video = time;
                seekTarget.fragmentedText=time;
            },0);
        };

    var getNextTime = function(arr, time) {
        //return time;
        //if video at time should not play, return next segment should play

        for(var i in arr.playEvents){
            if(time >= arr.playEvents[i].start && time < arr.playEvents[i].end){
                return time;
            }
            else{
                if(time < arr.playEvents[i].start){
                    return arr.playEvents[i].start;
                }
            }
        }
        return arr.totalTime;
    };
    var getBufferedTime = function(arr,time1,time2){
        var bt1 = 0;
        var bt2 = 0;
        for(var i in arr.playEvents){
            if(time1 >= arr.playEvents[i].start){
                if(time1 < arr.playEvents[i].end){
                    bt1 = bt1 + time1 - arr.playEvents[i].start;
                }
                else{
                    bt1 = bt1 + arr.playEvents[i].end - arr.playEvents[i].start;
                }
            }
            if(time2 >= arr.playEvents[i].start){
                if(time2 < arr.playEvents[i].end){
                    bt2 = bt2 + time2 - arr.playEvents[i].start;
                }
                else{
                    bt2 = bt2 + arr.playEvents[i].end - arr.playEvents[i].start;
                }
            }
        }
        console.log("time1:" + time1 + "time2:" + time2);
        console.log("bt1:" + bt1 + "bt2:" + bt2);
        return bt2 - bt1;
    };
    return {
        adapter: undefined,
        sourceBufferExt: undefined,
        virtualBuffer: undefined,
        playbackController: undefined,
        textSourceBuffer:undefined,

        setup: function() {
            this[MediaPlayer.dependencies.PlaybackController.eventList.ENAME_PLAYBACK_SEEKING] = onPlaybackSeeking;
        },

        setScheduleController: function(scheduleControllerValue) {
            var streamId = scheduleControllerValue.streamProcessor.getStreamInfo().id;
            scheduleController[streamId] = scheduleController[streamId] || {};
            scheduleController[streamId][scheduleControllerValue.streamProcessor.getType()] = scheduleControllerValue;
        },

        execute: function(context, callback) {
            console.log(callback);
            //this.requiredEvents = getArray();
            var playArray = SegmentController(desc,playRule);
            //var pbtime = this.playbackController.getTime();
            /**/
            var mediaInfo = context.getMediaInfo(),
                mediaType = mediaInfo.type,
                streamId = context.getStreamInfo().id,
                sc = scheduleController[streamId][mediaType],
            // EPSILON is used to avoid javascript floating point issue, e.g. if request.startTime = 19.2,
            // request.duration = 3.83, than request.startTime + request.startTime = 19.2 + 1.92 = 21.119999999999997
                EPSILON = 0.1,
                streamProcessor = scheduleController[streamId][mediaType].streamProcessor,
                representationInfo = streamProcessor.getCurrentRepresentationInfo(),
                st = seekTarget ? seekTarget[mediaType] : null,
                hasSeekTarget = (st !== undefined) && (st !== null),
                p = hasSeekTarget ? MediaPlayer.rules.SwitchRequest.prototype.STRONG  : MediaPlayer.rules.SwitchRequest.prototype.DEFAULT,
                rejected = sc.getFragmentModel().getRequests({state: MediaPlayer.dependencies.FragmentModel.states.REJECTED})[0],
                keepIdx = !!rejected && !hasSeekTarget,
                currentTime = streamProcessor.getIndexHandlerTime(),
                playbackTime = this.playbackController.getTime(),
                rejectedEnd = rejected ? rejected.startTime + rejected.duration : null,
                useRejected = !hasSeekTarget && rejected && ((rejectedEnd > playbackTime) && (rejected.startTime <= currentTime) || isNaN(currentTime)),
                buffer = streamProcessor.bufferController.getBuffer(),
                appendedChunks,
                range = null,
                time,
                toomuchbuffer = false,
                bufferedtime = 0,
                request;
            time = hasSeekTarget ? st : ((useRejected ? (rejected.startTime) : currentTime));

            var nextTime = getNextTime(playArray,playbackTime);

            if(nextTime !== playbackTime){
                playbackTime = nextTime;
                this.playbackController.seek(playbackTime);
            }
            console.log("time = "+time);
            bufferedtime = getBufferedTime(playArray,playbackTime,time);
            console.log("bufferedtime = " + bufferedtime);


            // limit proceeding index handler to max buffer -> limit pending requests queue
            /*
             if (!hasSeekTarget && !rejected && (time > playbackTime + MediaPlayer.dependencies.BufferController.BUFFER_TIME_AT_TOP_QUALITY)) {
             callback(new MediaPlayer.rules.SwitchRequest(null, p));
             return;
             }*/
            /**/
            toomuchbuffer = (bufferedtime > MediaPlayer.dependencies.BufferController.BUFFER_TIME_AT_TOP_QUALITY);
            if (!hasSeekTarget && !rejected && toomuchbuffer) {
                callback(new MediaPlayer.rules.SwitchRequest(null, p));
                return;
            }

            if (rejected) {
                sc.getFragmentModel().removeRejectedRequest(rejected);
            }

            if (isNaN(time) || (mediaType === "fragmentedText" && this.textSourceBuffer.getAllTracksAreDisabled())) {
                console.log("disableed");
                callback(new MediaPlayer.rules.SwitchRequest(null, p));
                return;
            }

            if (hasSeekTarget) {
                seekTarget[mediaType] = null;
            }

            if (buffer) {
                range = this.sourceBufferExt.getBufferRange(streamProcessor.bufferController.getBuffer(), time);
                if (range !== null) {
                    appendedChunks = this.virtualBuffer.getChunks({streamId: streamId, mediaType: mediaType, appended: true, mediaInfo: mediaInfo, forRange: range});
                    if (appendedChunks && appendedChunks.length > 0) {
                        time = appendedChunks[appendedChunks.length-1].bufferedRange.end;
                    }
                }
            }
            /*
             if(time> 20 && time < 90){
             time = 90;
             }
             */
            request = this.adapter.getFragmentRequestForTime(streamProcessor, representationInfo, time, {keepIdx: keepIdx});

            if (useRejected && request && request.index !== rejected.index) {
                request = this.adapter.getFragmentRequestForTime(streamProcessor, representationInfo, rejected.startTime + (rejected.duration / 2) + EPSILON, {keepIdx: keepIdx, timeThreshold: 0});
            }

            while (request && streamProcessor.getFragmentModel().isFragmentLoadedOrPending(request)) {
                if (request.action === "complete") {
                    request = null;
                    streamProcessor.setIndexHandlerTime(NaN);
                    break;
                }

                request = this.adapter.getNextFragmentRequest(streamProcessor, representationInfo);
            }

            if (request && !useRejected) {
                //streamProcessor.setIndexHandlerTime(request.startTime + request.duration);
                /**/

                var newStartTime = getNextTime(playArray,request.startTime);
                if(newStartTime !== request.startTime){
                    streamProcessor.setIndexHandlerTime(newStartTime);
                }
                else{
                    streamProcessor.setIndexHandlerTime(request.startTime + request.duration);
                }
                /*
                 if(request.startTime > 20 && request.startTime < 90){
                 streamProcessor.setIndexHandlerTime(90);
                 }
                 else{
                 streamProcessor.setIndexHandlerTime(request.startTime + request.duration);
                 }
                 */

            }
            callback(new MediaPlayer.rules.SwitchRequest(request, p));
        },

        reset: function() {
            seekTarget = {};
            scheduleController = {};
        }
    };
};

MediaPlayer.rules.VideoSkimmingRule.prototype = {
    constructor: MediaPlayer.rules.VideoSkimmingRule
};

SegmentController = function(segArray, callback){
    var playArray = new Array();
    for(var i in segArray.events){
        if(callback(segArray.events[i])){
            playArray.push(segArray.events[i]);
        }
    }
    return {"playEvents":playArray,"totalTime":segArray.events[segArray.events.length-1].end};
};

function playRule(arg){
    var requiredEvents = getArray();
    if(requiredEvents.length == 0) return true;
    for(var i in requiredEvents){
        if(arg.keywords.indexOf(requiredEvents[i]) != -1){
            return true;
        }
    }
    return false;
};

function getArray(){
    var id = document.getElementsByName('tag');
    var value = new Array();
    for(var i = 0; i < id.length; i++){
        if(id[i].checked) {
            value.push(id[i].value);
        }
    }

    return value;
};