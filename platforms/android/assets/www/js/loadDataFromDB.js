var UpdateData = (function () {
    var downloadedFiles = window.localStorage.downloadedFiles ? JSON.parse(window.localStorage.downloadedFiles) : {};

    function init() {
        PEMenu.itemList = window.localStorage.itemList ? JSON.parse(window.localStorage.itemList) : [];
        PEMenu.itemObjectIds = window.localStorage.itemObjectIds ? JSON.parse(window.localStorage.itemObjectIds) : {};
        PEMenu.categories = window.localStorage.categories ? JSON.parse(window.localStorage.categories) : [];
        PEMenu.parentCategories = window.localStorage.parentCategories ? JSON.parse(window.localStorage.parentCategories) : [];
        PEMenu.menu = window.localStorage.menu ? JSON.parse(window.localStorage.menu) : {};
        PEMenu.categoryList = window.localStorage.categoryList ? JSON.parse(window.localStorage.categoryList) : {};
        if (PEMenu.parentCategories && PEMenu.parentCategories.length) {
            SideMenu.init();
        }
    }

    function finishLoad() {
        processResults();
        SideMenu.init();
        Dom.hideSplash();
    }

    function handleSuccess(def) {
        console.log('data update completed')
        finishLoad();
        if (!window.localStorage.imagesLoaded || window.localStorage.imagesLoaded === 'false') {
            try {
                loadImages();
            } catch (err) {
                console.log(err);
            }
        } else {
            Dom.dataUpdateLoader.classList.remove('spinner');
            window.updateInProgress = false;
        }
    }

    function handleError(def, err) {
        finishLoad();
        Dom.dataUpdateLoader.classList.remove('spinner');
        window.updateInProgress = false;
        alert("Данные не обновлены. Для обновления данных нажмите кнопку в правом верхнем углу.");
    }

    function saveToLocalStorage() {
        if (downloadedFiles) {
            window.localStorage.downloadedFiles = JSON.stringify(downloadedFiles);
        }
        window.localStorage.categories = JSON.stringify(PEMenu.categories);
        window.localStorage.parentCategories = JSON.stringify(PEMenu.parentCategories);
        window.localStorage.itemList = JSON.stringify(PEMenu.itemList);
        window.localStorage.itemObjectIds = JSON.stringify(PEMenu.itemObjectIds);
        window.localStorage.menu = JSON.stringify(PEMenu.menu);
        window.localStorage.categoryList = JSON.stringify(PEMenu.categoryList);
    }

    function sortByPriority(arr) {
        var buf;
        for (var i = 0, l = arr.length; i < l; i++) {
            for (var j = 0; j < l; j++) {
                if ((arr[i].priority && !arr[j].priority) || (arr[i].priority < arr[j].priority)) {
                    buf = arr[i];
                    arr[i] = arr[j];
                    arr[j] = buf;
                }
            }
        }
    }

    function processResults() {
        Router.clearCache();
        PEMenu.parentCategories = [];
        PEMenu.menu = {};
        sortByPriority(PEMenu.categories);

        for (var i = 0, l = PEMenu.categories.length; i < l; i++) {
            PEMenu.categoryList[PEMenu.categories[i].objectId] = i;
        }

        for (var i = 0, l = PEMenu.categories.length; i < l; i++) {
            delete(PEMenu.categories[i].createdAt);
            delete(PEMenu.categories[i].updatedAt);
            if (!PEMenu.categories[i].parentCategory) {
                if (!PEMenu.menu[PEMenu.categories[i].objectId]) {
                    PEMenu.menu[PEMenu.categories[i].objectId] = {};
                    PEMenu.menu[PEMenu.categories[i].objectId].items = {};
                }
                if (PEMenu.categories[i].objectId !== PEMenu.newsCategory) {
                    PEMenu.parentCategories.push(PEMenu.categories[i]);
                }
            } else {
                if (!PEMenu.menu[PEMenu.categories[i].parentCategory]) {
                    PEMenu.menu[PEMenu.categories[i].parentCategory] = {};
                    PEMenu.menu[PEMenu.categories[i].parentCategory].items = {};
                }
                if (!PEMenu.menu[PEMenu.categories[i].parentCategory][PEMenu.categories[i].objectId]) {
                    PEMenu.menu[PEMenu.categories[i].parentCategory][PEMenu.categories[i].objectId] = {};
                    PEMenu.menu[PEMenu.categories[i].parentCategory][PEMenu.categories[i].objectId].items = {};
                }
            }
        }

        for (var i = 0, l = PEMenu.itemList.length; i < l; i++) {
            var categoryId = PEMenu.itemList[i].category,
                category = PEMenu.categories[PEMenu.categoryList[categoryId]];
            PEMenu.itemObjectIds[PEMenu.itemList[i].objectId] = i;
            if (!category.parentCategory) {
                PEMenu.menu[categoryId].items[PEMenu.itemList[i].objectId] = PEMenu.itemList[i];
            } else {
                if (!PEMenu.menu[category.parentCategory][categoryId]) {
                    PEMenu.menu[category.parentCategory][categoryId] = {};
                    PEMenu.menu[category.parentCategory][categoryId].items = {};
                }
                PEMenu.menu[category.parentCategory][categoryId].items[PEMenu.itemList[i].objectId] = PEMenu.itemList[i];
            }
        }

        for (var i = 0, l = PEMenu.categories.length; i < l; i++) {
            if (PEMenu.categories[i].img) {
                var item = PEMenu.itemList[PEMenu.itemObjectIds[PEMenu.categories[i].img]];
                if (item) {
                    PEMenu.categories[i].imgUrl = item.imgHybrid || item.img
                }
            }
        }

        saveToLocalStorage();
    }

    function loadImages() {
        var fs,
            dataPath,
            quota = 20 * 1024 * 1024;

        if (!isHybrid) {
            Dom.dataUpdateLoader.classList.remove('spinner');
            window.updateInProgress = false;
            return;
        }

        window.localStorage.imagesLoaded = false;

        if ((window.requestFileSystem || window.webkitRequestFileSystem)) {
            initLoad();
        } else {
            setTimeout(initLoad, 3000);
        }

        function initLoad() {
            window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
            window.storageInfo = window.storageInfo || window.webkitStorageInfo;

            if (window.storageInfo) {
                window.storageInfo.requestQuota(PERSISTENT, quota, function () {
                    startDownload();
                }, function (error) {
                    console.log(error);
                });
            } else {
                startDownload();
            }

            function startDownload() {
                window.requestFileSystem(PERSISTENT, quota, function (fileSystem) {
                    fs = fileSystem;
                    dataPath = cordova.file.dataDirectory || fs.root.toURL();
                    processDownload();
                }, function (error) {
                    console.log('error: ', error)
                });
            }

            function processDownload() {
                var maxAsyncLoad = 30,
                    reloadEvery = 20,
                    saveEvery = 5,
                    currentQue = 0,
                    imgsProcessed = 0,
                    needToLoad = 0,
                    alreadyLoaded = 0,
                    completedLoadAttempts = 0;

                console.log('load images started');
                var itemListLength = PEMenu.itemList.length;
                var ii = 0;
                (function processItem() {
                    if (ii < itemListLength) {
                        if (PEMenu.itemList[ii].img && (!downloadedFiles[PEMenu.itemList[ii].objectId] ||
                            (downloadedFiles[PEMenu.itemList[ii].objectId][0] != PEMenu.itemList[ii].img))) {
                            currentQue++;
                            needToLoad++;
                            setTimeout(function (j) {
                                downloadImage(PEMenu.itemList[j].objectId, PEMenu.itemList[j].img, j).then(function () {
                                    currentQue--;
                                    alreadyLoaded++;
                                    checkImgProcessed();
                                    ii++;
                                    completedLoadAttempts++;
                                    processItem();
                                }, function () {
                                    console.log(ii, ' load failed');
                                    currentQue--;
                                    ii++;
                                    completedLoadAttempts++;
                                    processItem();
                                });
                            }, 0, ii);
                            if (currentQue <= maxAsyncLoad) {
                                ii++;
                                processItem();
                            }
                        } else if (!PEMenu.itemList[ii].img && downloadedFiles[PEMenu.itemList[ii].objectId] && downloadedFiles[PEMenu.itemList[ii].objectId][1]) { //image was deleted
                            removeFile(downloadedFiles[PEMenu.itemList[ii].objectId][1]);
                            downloadedFiles[PEMenu.itemList[ii].objectId] = [null, null];
                            console.log(ii + ' no need to load, img removed');
                            ii++;
                            processItem();
                        } else if (downloadedFiles[PEMenu.itemList[ii].objectId]) {
                            PEMenu.itemList[ii].imgHybrid = downloadedFiles[PEMenu.itemList[ii].objectId][1];
                            console.log(ii + ' no need to load, already loaded');
                            if (PEMenu.itemList[ii].imgHybrid) {
                                checkImgProcessed();
                            }
                            ii++;
                            processItem();
                        } else {
                            downloadedFiles[PEMenu.itemList[ii].objectId] = [null, null];
                            console.log(ii + ' no need to load, other');
                            ii++;
                            processItem();
                        }
                    } else {
                        //images were downloaded
                        if (completedLoadAttempts === needToLoad) {
                            window.localStorage.downloadedFiles = JSON.stringify(downloadedFiles);
                            if (needToLoad === alreadyLoaded) {
                                window.localStorage.imagesLoaded = true;
                            }
                            console.log('images loaded');
                            if (isHybrid) {
                                try {
                                    navigator.app.clearCache();
                                } catch (err) {
                                    console.log(err);
                                }
                            }
                            processResults();
                            Dom.dataUpdateLoader.classList.remove('spinner');
                            window.updateInProgress = false;
                        }
                    }
                })();

                function checkImgProcessed() {
                    imgsProcessed++;
                    if (imgsProcessed % reloadEvery === 0) {
                        console.log('update dom on 10 images load');
                        processResults();
                    }
                    if (imgsProcessed % saveEvery === 0) {
                        window.localStorage.downloadedFiles = JSON.stringify(downloadedFiles);
                    }
                }

                function downloadImage(objectId, src, itemId) {
                    var imgDef = jQuery.Deferred();
                    console.log('trying to load: ', itemId, src)
                    var options;

                    if (isAndroid) {
                        options = new FileUploadOptions();
                        options.headers = {
                            Connection: "close"
                        };
                        options.chunkedMode = false;
                    }
                    var fileTransfer = new FileTransfer();

                    //delete old img
                    if (downloadedFiles[objectId] && downloadedFiles[objectId][1])
                        removeFile(dataPath + objectId);

                    fileTransfer.download(src, dataPath + objectId, function (fileEntry) {
                        if (fileEntry && fileEntry.nativeURL) {
                            downloadedFiles[PEMenu.itemList[itemId].objectId] = [src, fileEntry.nativeURL];
                            PEMenu.itemList[itemId].imgHybrid = fileEntry.nativeURL;
                            imgDef.resolve();
                        } else {
                            imgDef.reject();
                        }
                    }, function (err) {
                        loadSuccessful = false;
                        imgDef.reject();
                        console.log('fail ', err);
                    }, options);

                    return imgDef.promise();
                }
            }

            function removeFile(file) {
                var remove_file = function (entry) {
                    entry.remove(function () {
                        console.log(entry.toURL(), 'Entry deleted');
                    }, function (err) {
                        console.log(entry.toURL(), err);
                    });
                };

                // retrieve a file and truncate it
                window.resolveLocalFileSystemURL(file, remove_file, function (err) {
                    console.log(file, err)
                });
            }
        }
    }


    return function () {
        if (window.updateInProgress) {
            return;
        }
        try {
            Dom.dataUpdateLoader.classList.add('spinner');
        } catch (err) {
            console.log(err);
        }
        window.updateInProgress = true;
        var def = new jQuery.Deferred();
        init();
        console.log('updating');

        if (isHybrid) {
            try {
                navigator.app.clearCache();
            } catch (err) {
                console.log(err)
            }
        }

        var data = {},
            categories = new CategoryListDB(),
            timestamps = new TimeStampsDB(),
            categoriesUpdated = false,
            itemsUpdated = false,
            needUpdate = {
                items: false,
                categories: false
            };

        timestamps.fetch().then(function (response) {
            data.timestamps = response._serverData.results[0];
            if (!data.timestamps.items || !data.timestamps.categories) {
                alert('Ведутся профилактические работы. Приносим извинения за неудобства');
                handleError(def, response);
                return;
            }
            //window.timestampsId = data.timestamps.objectId;
            window.lastUid = data.timestamps.itemId;
            needUpdate.items = !PEMenu.itemList || !window.localStorage.menu || !window.localStorage.timestampsItems || window.localStorage.timestampsItems < data.timestamps.items;
            needUpdate.categories = !window.localStorage.categories || !window.localStorage.timestampsCategories || window.localStorage.timestampsCategories < data.timestamps.categories;
            //download categories
            if (needUpdate.categories) {
                categories.fetch().then(function (response) {
                    window.localStorage.timestampsCategories = data.timestamps.categories;
                    PEMenu.categories = response._serverData.results;
                    categoriesUpdated = true;
                    if (itemsUpdated) {
                        handleSuccess(def);
                    }
                }, function (response) {
                    handleError(def, response);
                });
            } else {
                categoriesUpdated = true;
                if (itemsUpdated) {
                    handleSuccess(def);
                }
            }
            //download items
            if (needUpdate.items) {
                var calls = 0,
                    limit = 1000;

                PEMenu.itemList = [];

                window.localStorage.imagesLoaded = false;

                (function getItems() {
                    new Parse.Query(ItemListDB).limit(limit).skip(calls * limit).find(function (response) {
                        if (response.length) {
                            PEMenu.itemList = PEMenu.itemList || [];
                            for (var i = 0, l = response.length; i < l; i++) {
                                response[i]._serverData.objectId = response[i].id;
                                PEMenu.itemList.push(response[i]._serverData);
                            }
                            calls++;
                            getItems();
                        } else {
                            itemsUpdated = true;
                            window.localStorage.timestampsItems = data.timestamps.items;
                            if (categoriesUpdated) {
                                handleSuccess(def);
                            }
                        }
                    }, function (response) {
                        handleError(def, response);
                    });
                })();
            } else {
                itemsUpdated = true;
                if (categoriesUpdated) {
                    handleSuccess(def);
                }
            }
        }, function (err) {
            handleError(def, err);
        });

        return def.promise();
    }
})();