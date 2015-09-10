/*
 *
 * Depends: jquery, jqueryui, muplayer, modernizr
 */
var $ = window.__$ ? window.__$ : window.jQuery;

var REQUEST_URLS = {
	RADIO_LIST: 'http://webapi.br.baidu.com/V1/op_xm_radio_list.jsonp',
	DEFAULT_SONG_LIST: 'http://webapi.br.baidu.com/V1/op_xm_radio_random.jsonp',
	GROUP_SONG_LIST: 'http://webapi.br.baidu.com/V1/type/{0}/id/{1}/group/{2}/op_xm_radio_song.jsonp',
	SONG_SEARCH: 'http://www.xiami.com/search/song?key={0}',
	SOUND_MANAGER_SWF: '/api_res/js/libs/soundmanager/swf/' 
};

var Utils = {
	getRandoms: function(data, length) {
		var copy = data.concat([]),
			ret = [],
			index;
		
	    for (var i = 0; i < length; i++) {
	        if (copy.length) {
	        	index = Math.floor(Math.random() * copy.length);
	           	ret.push(copy[index]);
	           	copy.splice(index, 1);
	        } else {
	            break;
	        }
	    }
	    
	    return ret;
	},
	
	getHost: function(url) {
		return /^(http:\/\/[^\/]+)\//.test(url) ? RegExp.$1 : '';
	},
	
	log: function(msg) {
		return false;
		
		var $log = $(parent.document.body).find('#radio-log');
		
		if (!$log.length) {
			$log = $('<div id="radio-log" style="width: 400px; height: 300px; overflow: auto; padding: 5px; position: absolute; top: 0; left: 0; z-index: 99999; border: solid 1px #ccc; background: #fff;" />').appendTo(parent.document.body);
		}
		
		$log.append('<p>' + msg + '</p>');
	}
};

var RadioPlayer = function(container) {
	var smSWFUrl = Utils.getHost(__uri('/api_res/js/libs/soundmanager/swf/soundmanager2.swf'));
	
	soundManager.setup({
		url: smSWFUrl + REQUEST_URLS.SOUND_MANAGER_SWF,
		flashVersion: 9,
		preferFlash: true
	});
	
	this._$widget = $(container);
	this._$wrapper = $(container).find('.qx-radio-player');
	this._$buttonPlay = $('.qx-radio-button-play', this._$wrapper);
	this._$buttonNext = $('.qx-radio-button-next', this._$wrapper);
	this._$volumebar = $('.qx-radio-player-volume-bar', this._$wrapper);
	this._$volumeSwitch = $('.qx-radio-button-volume-switch', this._$wrapper);
	this._$progressbar = $('.qx-radio-player-progressbar', this._$wrapper);
	this._$album = $('.qx-radio-player-album', this._$wrapper);
	
	this._csstransforms = Modernizr.prefixed('transform');
	this._playStore = {};
	this._albumErrorImage = new Image();
	this._albumErrorImage.src = __uri('/api_res/css/img/radioplayer/album-error.png');
	this.curRadio = {};
	
	this._create();
};

RadioPlayer.prototype = {
	constructor: RadioPlayer,
	
	_create: function() {
		var that = this;
		
		this._currentVolume = 50;
		
		this._$volumebar.slider({
			value: this._currentVolume,
			range: 'min',
			change: function(e, ui) {
				that._player.setVolume(ui.value);
			},
			stop: function(event, ui) {
				if (ui.value === 0) {
					that._$volumeSwitch.removeClass('qx-radio-state-voiced').addClass('qx-radio-state-mute');
					that._player.mute();
				} else {
					that._$volumeSwitch.addClass('qx-radio-state-voiced').removeClass('qx-radio-state-mute');
					that._player.unmute();
					that._currentVolume = ui.value;
				}
			}
		});
		
		this._$wrapper.find('.qx-radio-player-state').on({
			mouseenter: function() {
				if (that._$buttonPlay.hasClass('qx-radio-state-pause')) {
					that._$buttonPlay.stop(true, true).fadeIn(Modernizr.opacity ? 400 : 0);
				}
			},
			mouseleave: function() {
				if (that._$buttonPlay.hasClass('qx-radio-state-pause')) {
					that._$buttonPlay.stop(true, true).fadeOut(Modernizr.opacity ? 400 : 0);
				}
			}
		});
		
		this._$buttonPlay.on('click', function(event) {
			event.preventDefault();
			
			var $button = $(this),
				store = that._playStore[that._storeKey];
			
			if ($button.hasClass('qx-radio-state-play')) {
				$button.removeClass('qx-radio-state-play').addClass('qx-radio-state-pause');
				that._player.play();
				
				// report
				radioReporter.playClick(store.data[store.index]['song_name'], that.curRadio.name);
			} else {
				$button.addClass('qx-radio-state-play').removeClass('qx-radio-state-pause');
				that._player.pause();
			}
		});
		
		this._$volumeSwitch.on('click', function(event) {
			event.preventDefault();
			
			var $button = $(this);

			if (that._player.muted) {
				$button.addClass('qx-radio-state-voiced').removeClass('qx-radio-state-mute');
				that._player.unmute();
				
				that._player.setVolume(that._currentVolume);
				that._$volumebar.slider('value', that._currentVolume);
			} else {
				$button.removeClass('qx-radio-state-voiced').addClass('qx-radio-state-mute');
				that._player.mute();
				that._$volumebar.slider('value', 0);
			}
		});
		
		this._$buttonNext.on('click', function(event) {
			event.preventDefault();
			
			if (that.fetching) {
				return;
			}
			
			clearTimeout(that._nextClickTimer);
			that._nextClickTimer = setTimeout(function() {
				that._next(false);
			}, 250);
		});
		
		var reportBeforeUnload = function() {
			$(this).off('unload beforeunload');
			
			var i = new Date(),
				store = that._playStore[that._storeKey];
			
			if (that._playerState) {
				radioReporter.leavePage(store.data[store.index]['song_name'], that._player.position, that.curRadio.name);
			}
			
			while(new Date() - i < 500) {}
		};
		
		$(window).on('unload beforeunload', reportBeforeUnload);
	},
	
	_next: function(auto) {
		var store = this._playStore[this._storeKey],
			that = this;
		
		if (!auto) {
			
			// report
			radioReporter.nextClick(store.data[store.index]['song_name'], this._player.position, this.curRadio.name);
			
			this._player.stop();
		}
		
		this._$buttonPlay.addClass('qx-radio-state-play').removeClass('qx-radio-state-pause');
		this._pause();
		
		if (store.index + 1 > store.length - 1) {
			this.fetching = true;
			$('.qx-radio-player-state-loading', this._$wrapper).show();
			$.when(this._fetch()).done(function() {
				that.fetching = false;
				$('.qx-radio-player-state-loading', that._$wrapper).hide();
				that._add().play();
			});
		} else {
			store.index++;
			this._add().play();
		}
	},
	
	_add: function() {
		var store = this._playStore[this._storeKey],
			that = this;
		
		if (this._player) {
			if (this._playerState && this._playerState === 'playing') {
				this._player.stop();
			}
			
			this._player.unload();
			this._player.destruct();
		}
		
		this._player = soundManager.createSound({
			url: store.data[store.index]['listen_file'],
			
			onfinish: function() {
				
				// report
				radioReporter.nextAuto(store.data[store.index]['song_name'], this.duration, that.curRadio.name);
				
				that._playerState = 'finished';
				that._next(true);
			},
			
			onbufferchange: function() {
				if (this.isBuffering) {
					$('.qx-radio-player-state-loading', that._$wrapper).show();
					that._pause();
				} else {
					$('.qx-radio-player-state-loading', that._$wrapper).hide();
					that._rotate();
				}
			},
			
			whileloading: function() {
				that._playerState = 'loading';
			},
			
			whileplaying: function() {
				that._progress(this.position, this.duration);
				that._playerState = 'playing';
			},
			
			onplay: function() {
				that._$buttonPlay.removeClass('qx-radio-state-play').addClass('qx-radio-state-pause');
			},
			
			onresume: function() {
				that._rotate();
			},
			
			onpause: function() {
				that._$buttonPlay.addClass('qx-radio-state-play').removeClass('qx-radio-state-pause');
				that._pause();
				
				// report
				var reportDuration = (that.__prePausePosition__ ? (this.position - that.__prePausePosition__) : this.position);
				
				that.__prePausePosition__ = this.position;
				radioReporter.pauseClick(store.data[store.index]['song_name'], 
						reportDuration, that.curRadio.name);
			},
			
			onload: function(success) {
				if (success) {
					Utils.log('音乐加载成功！');
					Utils.log('音乐名称：' + (store.data[store.index]['song_name']));
					Utils.log('这首歌是这 ' + store.data.length + ' 首歌中的第 ' + (store.index + 1) + '首');
				} else {
					that._next();
					
					Utils.log('<span style="color: #f00;">音乐加载失败！</span>');
					Utils.log('<span style="color: #f00;">音乐名称：' + (store.data[store.index]['song_name']) + '</span>');
					Utils.log('<span style="color: #f00;">这首歌是这 ' + store.data.length + ' 首歌中的第 ' + (store.index + 1) + '首</span>');
				}
			}
		});
		
		if (this._$volumeSwitch.hasClass('qx-radio-state-mute')) {
			this._player.mute();
		}
		this._player.setVolume(this._currentVolume);
		this._refresh();
		
		return this._player;
	},
	
	_play: function() {
		this._add().play();
	},
	
	_rotate: function() {
		if (!Modernizr.csstransforms) {
			return;
		}
		
		var that = this,
			delay = 25;
			
		clearTimeout(this._rotateTimer);
		this._rotateTimer = setTimeout(function() {
			that._rotateDeg = !that._rotateDeg ? 1 : that._rotateDeg + 1;
			that._$album.css(that._csstransforms, 'rotate(' + that._rotateDeg + 'deg)');
			that._rotateTimer = setTimeout(arguments.callee, delay);
		}, delay);
	},
	
	_pause: function() {
		clearTimeout(this._rotateTimer);
	},
	
	_reset: function() {
		if (!Modernizr.csstransforms) {
			return;
		}
		
		this._$album.css(this._csstransforms, 'rotate(0deg)');
		this._$progressbar.find('.qx-radio-player-progressbar-cover-right').show()
				.css(this._csstransforms, 'rotate(0deg)')
			.end().find('.qx-radio-player-progressbar-cover-left-inner')
				.css(this._csstransforms, 'rotate(0deg)');
		
		this._rotateDeg = 0;
	},
	
	_refresh: function() {
		var store = this._playStore[this._storeKey],
			info = store.data[store.index],
			that = this;
			
		this._reset();
		
		this._$album
			.hide()
			.on('error', function() {
				$(this).off('error').attr('src', that._albumErrorImage.src);
			})
			.attr('src', info.album_logo.replace(/_1\.jpg$/, '_2.jpg'))
			.delay(250).fadeIn();
		
		this._$wrapper.find('.qx-radio-player-info').hide()
			.find('.qx-radio-player-info-name')
				.text(info.song_name)
				.attr('href', REQUEST_URLS.SONG_SEARCH.replace('{0}', encodeURIComponent(info.song_name)))
				.next('.qx-radio-player-info-artist')
				.text(info.artist_name)
			.end().end().fadeIn();
	},
	
	_progress: function(curPosition, duration) {
		if (!Modernizr.csstransforms) {
			return;
		}
		
		var progress = curPosition / duration * 360;
		
		if (isNaN(progress)) {
			progress = 0;
		}
		
		if (progress < 180) {
			this._$progressbar.find('.qx-radio-player-progressbar-cover-right')
				.css(this._csstransforms, 'rotate(' + progress + 'deg)');
		} else {
			this._$progressbar.find('.qx-radio-player-progressbar-cover-right').hide()
				.end().find('.qx-radio-player-progressbar-cover-left-inner')
				.css(this._csstransforms, 'rotate(' + (progress - 180) + 'deg)');
		}
	},
	
	_fetch: function() {
		var that = this,
			curRadio = this.curRadio,
			requestUrl, storeKey;
		
		if (curRadio.type === 'random') {
			storeKey = curRadio.type;
			this._playStore[storeKey] = {};
			requestUrl = REQUEST_URLS.DEFAULT_SONG_LIST;
		} else {
			storeKey = curRadio.type + '-' + curRadio.id;
			if (!this._playStore[storeKey]) {
				this._playStore[storeKey] = {
					capacity: curRadio.capacity,
					groupIndex: -1
				};
			}
			
			if (++this._playStore[storeKey].groupIndex > this._playStore[storeKey].capacity - 1) {
				this._playStore[storeKey].groupIndex = 0;
			}
			requestUrl = REQUEST_URLS.GROUP_SONG_LIST.replace('{0}', curRadio.type)
					.replace('{1}', curRadio.id)
					.replace('{2}', this._playStore[storeKey].groupIndex);
					
		}
		
		this._storeKey = storeKey;
		
		return $.ajax(requestUrl, {
			cache: true,
			dataType: 'jsonp',
			jsonp: 'cb',
			jsonpCallback: 'getmusiclist'
		}).done(function(res) {
			if (res.errCode !== 0) {
				that._$widget.trigger('error');
				return;
			}
			
			that._playStore[storeKey].data = res.data;
			that._playStore[storeKey].index = 0;
			that._playStore[storeKey].length = res.data.length;
			
			// log
			Utils.log('-----------------------------------------');
			Utils.log('音乐源数据获取成功！');
			if (curRadio.type !== 'random') {
				Utils.log('音乐源数据批次：' + that._playStore[storeKey].groupIndex);
			}
			Utils.log('音乐播放顺序：' + (curRadio.type === 'random' ? '随机' : '列表'));
			Utils.log('音乐数量：' + res.data.length);
			
		}).fail(function() {
			that._$widget.trigger('error');
			
			// log
			Utils.log('<span style="color: #f00;">音乐源数据请求失败！</span>');
		});
	},
	
	load: function(data) {
		var that = this;
		
		this.curRadio = data;
		this.fetching = true;
		
		$('.qx-radio-player-state-loading', this._$wrapper).show();
		$.when(this._fetch()).then(function() {
			that.fetching = false;
			soundManager.onready(function() {
				if (!that._initialized) {
					that._initialized = true;
					that._add();
				} else {
					that._play();
				}
				
				$('.qx-radio-player-state-loading', that._$wrapper).hide();
			});
		});
	}
};

var Radios = function(container, RadioPlayer) {
	this._$widget = $(container);
	this._$wrapper = $(container).find('.qx-radio-channels');
	this._$radios = $('.qx-radio-channels-types-pane', this._$wrapper);
	
	this._player = new RadioPlayer(container);
	this._termIndex = -1;
	
	this.radios = null;
	this.selectIndex = 0;
	
	this._create();
};

Radios.prototype = {
	constructor: Radios,
	
	_create: function() {
		var that = this;
		
		this._$wrapper
			.on('click', '.qx-radio-button-expand', function(event) {
				var $button = $(this);
				
				that._$radios.toggle('slide', {
					direction: 'down'
				}, function() {
					$button.toggleClass('qx-radio-state-expand qx-radio-state-collapse');
				});
				
				// report
				radioReporter.channelsExpand();
				
				return false;
			}).on('click', '.qx-radio-channels-types li', function(event) {
				event.preventDefault();
				
				if (that._player.fetching) {
					return;
				}
				
				var $type = $(this),
					channel = $type.find('a').text();
				
				that._select($type.index());
					
				// report
				radioReporter.channelClick(channel);
					
			}).on('click', '.qx-radio-button-change-types', function(event) {
				event.preventDefault();
				that._change();
				
				// report
				radioReporter.channelsChange();
			});
		
		this._$widget
			.on('click', '.qx-radio-button-refresh', function(event) {
				event.preventDefault();
				
				that._$widget.find('.qx-radio-error').hide();
				that.update();
			})
			.on('error', function() {
				$(this).find('.qx-radio-error').show();
			});
			
		if (!Radios._initialized) {

            if(Lib.xMessage){
                Lib.xMessage.on('parent.click',function(){
                    var $pane = $('.qx-radio-channels-types-pane');
                    if($pane.is(':visible')){
                        $pane.hide('slide', {direction: 'down'}, function() {
                            $(this).siblings('.qx-radio-channels-control-pane')
                                .find('.qx-radio-button-expand')
                                .toggleClass('qx-radio-state-expand qx-radio-state-collapse');
                        });
                    }
                });
            }
            $(document).on('click', function(event) {
                var $pane = $('.qx-radio-channels-types-pane');
                if (!$(event.target).closest('.qx-radio-channels').length &&
                    $pane.is(':visible')) {
                    $pane.hide('slide', {direction: 'down'}, function() {
                        $(this).siblings('.qx-radio-channels-control-pane')
                            .find('.qx-radio-button-expand')
                            .toggleClass('qx-radio-state-expand qx-radio-state-collapse');
                    });
                }
            });

			Radios._initialized = true;
		}
		
		this.update();
	},
	
	_update: function() {
		var that = this;
		
		this._$widget.find('.qx-radio-player-loading').show();
		this._$radios.find('.qx-radio-channels-loading').show();
		
		return $.ajax(REQUEST_URLS.RADIO_LIST, {
			cache: true,
			dataType: 'jsonp',
			jsonp: 'cb',
			jsonpCallback: 'getradiolist'
		}).done(function(res) {
			if (res.errCode !== 0) {
				that._$widget.trigger('error');
				return;
			}
			
			var $typesPane = that._$radios.find('.qx-radio-channels-types-pane-inner').empty();
			
			that.radios = res.data.reverse();
			
			that._change();
			$typesPane.append('<a class="qx-radio-button-change-types" href="#">' + 
					'<span class="qx-radio-button-icon"></span>换一换</a>');
					
			that._$widget.find('.qx-radio-player-loading').fadeOut();
			that._$radios.find('.qx-radio-channels-loading').hide();
		}).fail(function() {
			that._$widget.trigger('error');
		});
	},
	
	_change: function() {
		this.groupIndex  = (typeof this.groupIndex !== 'undefined' ? 
			(this.groupIndex + 1 > this.radios.length - 1 ? 0 : this.groupIndex + 1) : 0);
		
		var $ul = this._$radios.find('.qx-radio-channels-types'),
			customSelected = this.selectIndex !== 0,
			li = ['<li data-type="random" data-name="随心听"><a href="">随心听</a></li>'],
			radios = Utils.getRandoms(this.radios[this.groupIndex].radios, 7),
			$active, visitedData;
		
		if (!$ul.length) {
			$ul = $('<ul class="qx-radio-channels-types" />')
				.appendTo(this._$radios.find('.qx-radio-channels-types-pane-inner'));
		}
		
		if (customSelected) {
			if (this.visitedChannel) {
				visitedData = this.visitedChannel.data;
				$active = $('<li data-id="' + visitedData.id + 
						'" data-type="' + visitedData.type + 
						'" data-name="' + visitedData.name + 
						'" data-capacity="' + visitedData.capacity + '">' + 
						'<a href="">' + this.visitedChannel.text + '</a></li>').appendTo('body');
					
				this.visitedChannel = null;
			} else {
				$active = $ul.find('li').eq(this.selectIndex).clone(true);
			}
		}
		
		$.each(radios, function(i, radio) {
			var radioText = radio.name.replace('电台', '');
			
			if (radioText.toLowerCase() === "older's") {
				radioText = '经典';
			}
			
			// continue to next
			if ($active && $active.data('type') === radio.type && $active.data('id') === radio.id) {
				return;
			}
			
			li.push('<li data-id="' + radio.id + 
					'" data-type="' + radio.type + 
					'" data-name="' + radioText + 
					'" data-capacity="' + radio.capacity + '">' + 
					'<a href="">' + radioText + '</a></li>');
		});
		
		if (customSelected) {
			if (li.length - 1 === radios.length) {
				li.splice(1, 1);
			}
			
			$ul.empty().append(li.join('')).find('li').eq(this.selectIndex - 1).after($active);
		} else {
			$ul.empty().append(li.join(''));
		}
		
		this._select();
	},
	
	_select: function(index) {
		var $active, channel;
		
		index = (typeof index === 'undefined' ? this.selectIndex : index);
		
		this._$radios.find('.qx-radio-channels-types')
			.find('li').removeClass('qx-radio-channels-type-active')
			.eq(index).addClass('qx-radio-channels-type-active');
		
		if (index === this._termIndex) {
			return;
		}
		
		$active = this._$radios.find('.qx-radio-channels-types li').eq(index);
		channel = $active.find('a').text();
		this._player.load($active.data());
		this._termIndex = index;
		this.selectIndex = index;
		
		$('.qx-radio-button-expand', this._$wrapper)
			.find('.qx-radio-cur-channel-text').text(channel);
		
		Lib.userData.setItem('radioChannel', JSON.stringify({
			selectIndex: index,
			text: channel,
			data: $active.data()
		}));
	},
	
	update: function() {
		var that = this;

		if (Lib.canExecParent) {
			that._update();
		} else {
			if (/BIDUBrowser/i.test(navigator.userAgent)) {
				return that._update();
			}
			
			Lib.userData.getItem('radioChannel', function(res) {
				 
				var channelData;
				
				if (res && res.error === 0) {
					channelData = JSON.parse(res.body);
				}
				
				if (channelData) {
					that.selectIndex = channelData.selectIndex;
					that.visitedChannel = channelData;
				}
				
				that._update();
			});
		}
	}
};

var respond = {
	_scale: function() {
		var minSize = 960,
			scaling = Math.min(1, (Math.max(minSize, this._$win.width()) / 1261));
			
		$('#qx-radio').css('font-size', 16 * scaling);
	},
	
	init: function() {
		var that = this;
		
		this._$win = $(window);
		
		this._scale();

        Lib.bindXResize(function(){
            clearTimeout(that._resizeTimer);
            that._resizeTimer = setTimeout(function() {
                that._scale();
            }, 25);
        });
	}
};