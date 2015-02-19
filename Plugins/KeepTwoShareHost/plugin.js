var KeepTwoShareHost = function() {
    var pluginApi = new PluginApi();

    var _this = this;
    var testUrls = [
        'http://k2s.cc/file/52ca59dc518ca',
        'http://k2s.cc/file/f77498090903d' ,
        'http://k2s.cc/file/52d22944795ba',
        'http://k2s.cc/file/ce336be1d823b',
        'http://k2s.cc/file/3117027eb7695',

        'http://k2s.cc/file/52dfb44aa22b3',  //not available file
        'http://k2s.cc/file/a24f21fab126f' //too big file
    ]

    HostBase.call(this);
    this.name = 'keep2share.cc'
    this.regexArray = ['http://keep2share.cc' , 'https://keep2share.cc', 'https://k2s.cc', 'http://k2s.cc']
    this.SLOWPOSSIBLE = "Click here for slow download";
    this.CAPTCHAERROR = "The verification code is incorrect";
    this.NOTAVAILABLE = "This file is no longer available";
    this.PREMIUMREQUIRED = "Free user can't download large files";
   
    //Starting point
    this.StartWorkflow = function (itemDto) {

        var item = {};
        item.guid = itemDto.guid;
        item.baseUrl = itemDto.baseUrl;
        _this.HandleWelcomeScreen(item);
    };


    //Workflow methods:

    this.HandleWelcomeScreen = function (item) {
        pluginApi.getPage(item.baseUrl,

            function onSuccess(response) {
                item.welcomeScreen = response;
                var welcomeScreenString = $('body', item.welcomeScreen).html().toString();
                var el = item.welcomeScreen;

                //slow download
                if (welcomeScreenString.indexOf(_this.SLOWPOSSIBLE) !== -1) {
                    item.fileName = $('.name', el).find("span")[0].innerText;
                    item.fileSize = $('.size', el)[0].innerText;
                    _this.HandleSlow(item);
                }
                else {
                //TODO
                }

            //todo dorobic ifPRemium
            },

            function onError(response){

                var responseString = $('body', response).html().toString();
                if (responseString.search(_this.NOTAVAILABLE) !== -1)
                {
                    item.State = "NotAvailable";
                }
                if (responseString.search("Error 404") !== -1)
                {
                    item.State = "Error404";
                }
                else
                {
                    //todo jakis generalerror
                }
        });
    }

    this.HandleSlow = function (item) {

        var el = item.welcomeScreen;
        var downloadFormEl = $("button:contains('Low speed')", el).closest('form')
        var formDataName = downloadFormEl.find('input').attr('name');
        var formDataValue = downloadFormEl.find('input').attr('value');
        var url = item.baseUrl;

        //todo to bardziej obiektowo, mniej hardcode!
        var formData = formDataName + '=' + formDataValue;

       pluginApi.Post(
           url,
           formData,
           function onSuccess(response) {

            var pageDom = response;
            var pageString =  $('body', pageDom).html().toString();

            var url = item.baseUrl;

            var captchaImageElement = $("#captcha-form", pageDom).find('img')
            
            //ON CAPTCHA FOUND:
            if (captchaImageElement.length != 0) {

                var captchaInputElement = $("#uniqueId", pageDom);
                var uniqueId = captchaInputElement.attr('value');

                var onImageExtractionSuccess = function(solution)
                {
                    _this.SubmitCaptchaSolution(item,solution,uniqueId,url)
                }

                _this.ExtractCaptcha(pageDom,item,onImageExtractionSuccess)
            }

            //if download already available------------------------------------------------------------------------------
            var buttonEl = $("#downloader-main", pageDom).find('button:contains("Download")')
            if (buttonEl.length != 0) {
                item.downloadScreen = response;
                _this.HandleDownloadScreen(item);
                return;
            }

            //if dling two files simultaneously--------------------------------------------------------------------------
            var errorString = "Free account does not allow to download more than one file at the same time";
            if (pageString.indexOf(errorString) !== -1)
            {
                item.State = "OnlyOneFileError";
            }

            //if wait required--------------------------------------------------------------------------
            if (pageString.search(/Please wait(.*)to download this file/) !== -1)
            {
                item.State = "WaitRequiredError";
            }

            //if premium required--------------------------------------------------------------------------
            if (pageString.search(_this.PREMIUMREQUIRED) !== -1)
            {
                item.State = "PremiumRequired";
            }

        });
    };

    this.ActivateDownloadLink = function (item) {
        //download file method

        var timer = $('#download-wait-timer', item.countDownScreen);
        var waitTime = parseInt(timer.html()) * 1000;

        var uniqueId = item.countDownScreenString.match(/uniqueId: '(.*)',/)[1];

        var fileData = "uniqueId=" + uniqueId + "&free=1"

        var headers = {  "X-Requested-With": "XMLHttpRequest" };

        item.downloadLink = "http://" + item.uri.hostname() + "/file/url.html?file=" + uniqueId;

        setTimeout(function () {
            pluginApi.Post(item.baseUrl, fileData,
                            function(){
                                pluginApi.Download(item)
                            }, headers)
                    }, waitTime);

    }

    this.HandleCaptchaResponse = function (response,item) {

        var responseString = $('body',response).html().toString();
        if ( responseString.indexOf(_this.CAPTCHAERROR) == -1)
        {
            item.countDownScreen = response;
            item.countDownScreenString = $('body', response).html().toString();
            _this.ActivateDownloadLink(item);

        }
        else
        {
            _this.RepeatCaptcha(item,response)
        }
    }

    this.SubmitCaptchaSolution = function (item,solution,uniqueId,url) {

        var formData = "CaptchaForm[code]=" + solution + "&free=1&freeDownloadRequest=1&uniqueId="
            + uniqueId;

        pluginApi.Post(
            url,
            formData,
            function onPostSuccess(response){
                _this.HandleCaptchaResponse(response,item)
            })
    }

    this.HandleDownloadScreen = function(item) {
        var pageString = $('body',item.downloadScreen).html().toString();
        item.downloadLink ="http://" + item.uri.hostname() + pageString.match(/window.location.href = '(.*)'/)[1];
        pluginApi.Download(item);
    }

    this.RepeatCaptcha = function(item,captchaScreen)    {
        _this.ExtractCaptcha(captchaScreen,item,function onCaptchaExtractionSuccess(){
            _this.SendItemDto(item);
            pluginApi.openCaptchaWindow(item);
        })
    }

    this.ExtractCaptcha = function (captchaScreen, item, onSuccess) {
        var captchaEl = $("#captcha-form", captchaScreen).find('img')
        if (captchaEl.length != 0) {

            pluginApi.getBase64Image(captchaEl[0].src,
                function onGotImage(image) {

                    _this.SendItemDto(item);
                    pluginApi.openCaptchaWindow(item,image,

                        function (solution){
                            onSuccess(solution)
                        }


                    );
                })

        };
            return;
        }

    }




KeepTwoShareHost.prototype = new HostBase();
KeepTwoShareHost.constructor = KeepTwoShareHost;

//# sourceURL=dynamicScript.js

