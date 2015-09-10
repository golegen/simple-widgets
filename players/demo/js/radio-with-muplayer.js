/*
 * 
 * Depends: jquery, jqueryui, muplayer, modernizr
 */ 
var REQUEST_URLS = {
	RADIO_LIST: 'http://webapi.br.baidu.com/V1/op_xm_radio_list.jsonp',
	DEFAULT_SONG_LIST: 'http://webapi.br.baidu.com/V1/op_xm_radio_random.jsonp',
	GROUP_SONG_LIST: 'http://webapi.br.baidu.com/V1/type/{0}/id/{1}/group/{2}/op_xm_radio_song.jsonp',
	SONG_SEARCH: 'http://www.xiami.com/search/song?key={0}',
	MUPLAYER_STATIC_RES: 'js/libs/muplayer/' 
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
	}
};

var RadioPlayer = function(container) {
	
	// TODO: 需要在使用时修改路径
	var local = 'http://n.cn:8080/codebase-v2/workshop/javascript/libs/others/radio-player/src/';
	
	this._$widget = $(container);
	this._$wrapper = $(container).find('.qx-radio-player');
	this._$buttonPlay = $('.qx-radio-button-play', this._$wrapper);
	this._$buttonNext = $('.qx-radio-button-next', this._$wrapper);
	this._$volumebar = $('.qx-radio-player-volume-bar', this._$wrapper);
	this._$volumeSwitch = $('.qx-radio-button-volume-switch', this._$wrapper);
	this._$progressbar = $('.qx-radio-player-progressbar', this._$wrapper);
	this._$album = $('.qx-radio-player-album', this._$wrapper);
	
	this._currentVolume = 50;
	this._player = new _mu.Player({
		baseDir: local + REQUEST_URLS.MUPLAYER_STATIC_RES, 
		volume: this._currentVolume
	});
	
	this._csstransforms = Modernizr.prefixed('transform');
	this._playStore = {};
	
	this.curRadio = {};
	
	this._create();
};

RadioPlayer.prototype = {
	constructor: RadioPlayer,
	
	_create: function() {
		var that = this;
		
		this._bindPayerEvents();
		
		this._$volumebar.slider({
			value: this._currentVolume,
			range: 'min',
			change: function(e, ui) {
				that._player.setVolume(ui.value);
			},
			stop: function(event, ui) {
				if (ui.value === 0) {
					that._$volumeSwitch.removeClass('qx-radio-state-voiced').addClass('qx-radio-state-mute');
					that._player.setMute(true);
				} else {
					that._$volumeSwitch.addClass('qx-radio-state-voiced').removeClass('qx-radio-state-mute');
					that._player.setMute(false);
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
			
			var $button = $(this);
			
			if ($button.hasClass('qx-radio-state-play')) {
				$button.removeClass('qx-radio-state-play').addClass('qx-radio-state-pause');
				that._player.play();
			} else {
				$button.addClass('qx-radio-state-play').removeClass('qx-radio-state-pause');
				that._player.pause();
			}
		});
		
		this._$volumeSwitch.on('click', function(event) {
			event.preventDefault();
			
			var $button = $(this),
				isMute = that._player.getMute();

			if (isMute) {
				$button.addClass('qx-radio-state-voiced').removeClass('qx-radio-state-mute');
				that._player.setMute(false);
				
				that._player.setVolume(that._currentVolume);
				that._$volumebar.slider('value', that._currentVolume);
			} else {
				$button.removeClass('qx-radio-state-voiced').addClass('qx-radio-state-mute');
				that._player.setMute(true);
				that._$volumebar.slider('value', 0);
			}
		});
		
		this._$buttonNext.on('click', function(event) {
			event.preventDefault();
			that._player.next();
		});
		
		this._$album.on('load', function() {
			$(this).fadeIn();
		});
		
		var reportBeforeUnload = function() {
			$(this).off('unload beforeunload');
			
			var i = new Date(),
				song = that._getSongInfo(that._player.getCur());
			
			//if (that._playerState) {
				
				// report: leave page
				// console.log(song['song_name'], (that._playerPosition ? that._playerPosition : 0), that.curRadio.name);
			//}
			
			while(new Date() - i < 500) {}
		};
		
		$(parent).on('unload beforeunload', reportBeforeUnload);
	},
	
	_bindPayerEvents: function() {
		var that = this;
		
		this._player
			.on('prebuffer', function() {
				$('.qx-radio-player-state-loading', that._$wrapper).show();
				that._playerState = 'prebuffer';
				that._pause();
			})
			.on('playing', function() {
				$('.qx-radio-player-state-loading', that._$wrapper).hide();
				that._playerState = 'playing';
				that._playerDuration = that._player.duration();
				that._rotate();
			})
			.on('player:next', function(data) {
				that._refresh();
				
				// report
				var song = that._getSongInfo(data.cur);
				//if (data.auto) {
					
					// next auto
					// console.log(song['song_name'], that._playerDuration * 1000, that.curRadio.name);
				//} else {
					
					// next click
					// console.log(song['song_name'], (that._playerPosition ? that._playerPosition : 0) * 1000, that.curRadio.name);
				//}
			})
			.on('player:play', function() {
				that._$buttonPlay.removeClass('qx-radio-state-play').addClass('qx-radio-state-pause');
				
				// report
				var song = that._getSongInfo(that._player.getCur());
				
				// play
				// console.log(song['song_name'], that.curRadio.name);
			})
			.on('player:pause', function() {
				that._$buttonPlay.addClass('qx-radio-state-play').removeClass('qx-radio-state-pause');
				that._pause();
				
				// report
				var curPos = that._player.curPos(),
					reportDuration = (that.__prePausePosition__ ? 
						(curPos - that.__prePausePosition__) : 
						curPos),
					song = that._getSongInfo(that._player.getCur());
				
				that.__prePausePosition__ = curPos;
				
				// pause
				// console.log(song['song_name'], reportDuration * 1000, that.curRadio.name);
			})
			.on('player:stop', function() {
				var index;
				
				that._$buttonPlay.addClass('qx-radio-state-play').removeClass('qx-radio-state-pause');
				that._pause();	
					
				if (that.curRadio.type === 'random') {
					return;
				}
				
				index = that._getSongIndex(that._player.getCur());
				if (index === that._player.playlist.list.length - 1) {
					$('.qx-radio-player-state-loading', that._$wrapper).show();
					$.when(that._fetch()).then(function() {
						that._play();
					});
				}
			})
			.on('timeupdate', function() {
				that._playerPosition = that._player.curPos();
				that._progress(that._playerPosition, that._player.duration());
			});
	},
	
	_getSongInfo: function(curSong) {
		var curIndex = this._getSongIndex(curSong);
			song = this._playStore[this._storeKey].originalData[curIndex];
			
		return song;
	},
	
	_getSongIndex: function(curSong) {
		return $.inArray(curSong, this._player.playlist.list);
	},
	
	_add: function() {
		if (this._player.playlist.list.length) {
			this._player.reset();
		}
		
		this._player.setMode(this.curRadio.type === 'random' ? 'random' : 'list');
		this._player.add(this._playStore[this._storeKey].songList);
		this._refresh();
	},
	
	_play: function() {
		this._add();
		this._player.play();
	},
	
	_rotate: function() {
		if (!Modernizr.csstransforms) {
			return;
		}
		
		var that = this,
			delay = 50;
			
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
		
		this._$progressbar.find('.qx-radio-player-progressbar-cover-right').show()
				.css(this._csstransforms, 'rotate(0deg)')
			.end().find('.qx-radio-player-progressbar-cover-left-inner')
				.css(this._csstransforms, 'rotate(0deg)');
		
		this._rotateDeg = 0;
	},
	
	_refresh: function() {
		var song = this._getSongInfo(this._player.getCur());
		
		this._reset();
		
		this._$album
			.hide().attr('src', song['album_logo'].replace(/_1\.jpg$/, '_2.jpg'));
			
		this._$wrapper.find('.qx-radio-player-info').hide()
			.find('.qx-radio-player-info-name')
				.text(song['song_name'])
				.attr('href', REQUEST_URLS.SONG_SEARCH.replace('{0}', encodeURIComponent(song['song_name'])))
				.next('.qx-radio-player-info-artist')
				.text(song['artist_name'])
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
			if (res.errCode === 0) {
				var list = $.map(res.data, function(n, i) {
						return n['listen_file'];
					});
				
				that._playStore[storeKey].originalData = res.data;
				that._playStore[storeKey].songList = list;
			} else {
				that._$widget.trigger('error');
			}
		}).fail(function() {
			that._$widget.trigger('error');
		});
	},
	
	load: function(data) {
		var that = this;
		
		this.curRadio = data;
		
		$('.qx-radio-player-state-loading', this._$wrapper).show();
		$.when(this._fetch()).then(function() {
			if (!that._initialized) {
				that._initialized = true;
				that._add();
			} else {
				that._play();
			}
			
			$('.qx-radio-player-state-loading', that._$wrapper).hide();
		});
	}
};

var Radios = function(container) {
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
				
				if ($button.hasClass('qx-radio-state-expand')) {
					
					// report: expand radios
					// console.log('radios pane expand');
				}
				
				that._$radios.toggle('slide', {
					direction: 'down'
				}, function() {
					$button.toggleClass('qx-radio-state-expand qx-radio-state-collapse');
				});
				
				return false;
			})
			.on('click', '.qx-radio-channels-types li', function(event) {
				event.preventDefault();
				
				var $type = $(this),
					channel = $type.find('a').text();
				
				$('.qx-radio-button-expand', that._$wrapper)
					.find('.qx-radio-cur-channel-text').text(channel);
					
				that._select($type.index());
					
				// report: change channel
				//console.log(channel);
					
			})
			.on('click', '.qx-radio-button-change-types', function(event) {
				event.preventDefault();
				that._change();
				
				// report: change channels
				// console.log('channels change');
			})
			.on('click', '.qx-radio-button-refresh', function(event) {
				event.preventDefault();
				that._$widget.trigger('reload');
			});
		
		this._$widget
			.on('error', function() {
				$(this).find('.qx-radio-error').show();
			})
			.on('reload', function() {
				that._update();
			});
			
		if (!Radios._initialized) {
			$(document).on('click', function(event) {
				if (!$(event.target).closest('.qx-radio-channels').length && 
						$('.qx-radio-channels-types-pane').is(':visible')) {
							
					$('.qx-radio-channels-types-pane').hide('slide', {direction: 'down'}, function() {
						$(this).siblings('.qx-radio-channels-control-pane')
							.find('.qx-radio-button-expand')
							.toggleClass('qx-radio-state-expand qx-radio-state-collapse');
					});
				}
			});
			
			Radios._initialized = true;
		}
		
		this._update();
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
			if (res.errCode === 0) {
				var $typesPane = that._$radios.find('.qx-radio-channels-types-pane-inner').empty();
				
				that.radios = res.data.reverse();
				
				that._change();
				$typesPane.append('<a class="qx-radio-button-change-types" href="#">' + 
						'<span class="qx-radio-button-icon"></span>换一换</a>');
						
				that._$widget.find('.qx-radio-player-loading').fadeOut();
				that._$radios.find('.qx-radio-channels-loading').hide();
			} else {
				that._$widget.trigger('error');
			}
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
			$active;
		
		if (!$ul.length) {
			$ul = $('<ul class="qx-radio-channels-types" />')
				.appendTo(this._$radios.find('.qx-radio-channels-types-pane-inner'));
		}
		
		if (customSelected) {
			$active = $ul.find('li').eq(this.selectIndex).clone(true);
		}
		
		$.each(radios, function(i, radio) {
			
			// continue to next
			if ($active && $active.data('type') === radio.type && $active.data('id') === radio.id) {
				return;
			}
			
			li.push('<li data-id="' + radio.id + 
					'" data-type="' + radio.type + 
					'" data-name="' + radio.name + 
					'" data-capacity="' + radio.capacity + '">' + 
					'<a href="">' + radio.name.replace('电台', '') + '</a></li>');
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
		index = (typeof index === 'undefined' ? this.selectIndex : index);
		
		this._$radios.find('.qx-radio-channels-types')
			.find('li').removeClass('qx-radio-channels-type-active')
			.eq(index).addClass('qx-radio-channels-type-active');
		
		if (index === this._termIndex) {
			return;
		}
		
		this._player.load(this._$radios.find('.qx-radio-channels-types li').eq(index).data());
		this._termIndex = index;
		this.selectIndex = index;
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
		this._$win.on('resize', function() {
			clearTimeout(that._resizeTimer);
			that._resizeTimer = setTimeout(function() {
				that._scale();
			}, 25);
		});
	}
};