/*! Scroller 1.4.3
 * ©2011-2017 SpryMedia Ltd - datatables.net/license
 */

/**
 * @summary     Scroller
 * @description Virtual rendering for DataTables
 * @version     1.4.3
 * @file        dataTables.scroller.js
 * @author      SpryMedia Ltd (www.sprymedia.co.uk)
 * @contact     www.sprymedia.co.uk/contact
 * @copyright   Copyright 2011-2017 SpryMedia Ltd.
 *
 * This source file is free software, available under the following license:
 *   MIT license - http://datatables.net/license/mit
 *
 * This source file is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE. See the license files for details.
 *
 * For details please refer to: http://www.datatables.net
 */

(function (factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD
		define(['jquery', 'datatables.net'], function ($) {
			return factory($, window, document);
		});
	} else if (typeof exports === 'object') {
		// CommonJS
		module.exports = function (root, $) {
			if (!root) {
				root = window;
			}

			if (!$ || !$.fn.dataTable) {
				$ = require('datatables.net')(root, $).$;
			}

			return factory($, root, root.document);
		};
	} else {
		// Browser
		factory(jQuery, window, document);
	}
}(function ($, window, document, undefined) {
	'use strict';

	/**
	 * Scroller is a virtual rendering plug-in for DataTables which allows large
	 * datasets to be drawn on screen every quickly. What the virtual rendering means
	 * is that only the visible portion of the table (and a bit to either side to make
	 * the scrolling smooth) is drawn, while the scrolling container gives the
	 * visual impression that the whole table is visible. This is done by making use
	 * of the pagination abilities of DataTables and moving the table around in the
	 * scrolling container DataTables adds to the page. The scrolling container is
	 * forced to the height it would be for the full table display using an extra
	 * element.
	 *
	 * Note that rows in the table MUST all be the same height. Information in a cell
	 * which expands on to multiple lines will cause some odd behaviour in the scrolling.
	 *
	 * Scroller is initialised by simply including the letter 'S' in the sDom for the
	 * table you want to have this feature enabled on. Note that the 'S' must come
	 * AFTER the 't' parameter in `dom`.
	 *
	 * Key features include:
	 *   <ul class="limit_length">
	 *     <li>Speed! The aim of Scroller for DataTables is to make rendering large data sets fast</li>
	 *     <li>Full compatibility with deferred rendering in DataTables for maximum speed</li>
	 *     <li>Display millions of rows</li>
	 *     <li>Integration with state saving in DataTables (scrolling position is saved)</li>
	 *     <li>Easy to use</li>
	 *   </ul>
	 *
	 *  @class
	 *  @constructor
	 *  @global
	 *  @param {object} dt DataTables settings object or API instance
	 *  @param {object} [opts={}] Configuration object for FixedColumns. Options 
	 *    are defined by {@link Scroller.defaults}
	 *
	 *  @requires jQuery 1.7+
	 *  @requires DataTables 1.10.0+
	 *
	 *  @example
	 *    $(document).ready(function() {
	 *        $('#example').DataTable( {
	 *            "scrollY": "200px",
	 *            "ajax": "media/dataset/large.txt",
	 *            "dom": "frtiS",
	 *            "deferRender": true
	 *        } );
	 *    } );
	 */
	var Scroller = function (dt, opts) {
		/* Sanity check - you just know it will happen */
		if (!(this instanceof Scroller)) {
			alert("Scroller warning: Scroller must be initialised with the 'new' keyword.");
			return;
		}

		// Don't initialise Scroller twice on the same table
		if (dt.oScroller) {
			return;
		}

		// Set own fnInfoCallback if necessary
		if (dt.oFeatures.bInfo && !dt.oLanguage.fnInfoCallback) {
			dt.oLanguage.fnInfoCallback = this._fnInfoCallback.bind(this);
		}

		if (opts === undefined) {
			opts = {};
		}

		this.dt = $.fn.dataTable.Api(dt);

		this.s = {
			/**
			 * DataTables settings object
			 *  @type     object
			 *  @default  Passed in as first parameter to constructor
			 */
			"dt": dt,

			/**
			 * Pixel location of the boundary for when the next data set should be loaded and drawn
			 * when scrolling up the way.
			 *  @type     int
			 *  @default  0
			 *  @private
			 */
			"redrawTop": 0,

			/**
			 * Pixel location of the boundary for when the next data set should be loaded and drawn
			 * when scrolling down the way. Note that this is actually calculated as the offset from
			 * the top.
			 *  @type     int
			 *  @default  0
			 *  @private
			 */
			"redrawBottom": 0,

			/**
			 * Height of rows in the table
			 *  @type     int
			 *  @default  0
			 */
			"rowHeight": 0,

			/**
			 * Number of rows calculated as visible in the visible viewport
			 *  @type     int
			 *  @default  0
			 */
			"viewportRows": 0,

			/**
			 * Show select Info
			 *  @type     boolean
			 *  @default  false
			 */
			"selectInfo": false
		};

		this.c = $.extend(Scroller.oDefaults, opts);

		/**
		 * DOM elements used by the class instance
		 * @private
		 * @namespace
		 *
		 */
		this.dom = {
			"force": document.createElement('div'),
			"scroller": null,
			"table": null,
		};

		// Attach the instance to the DataTables instance so it can be accessed in future. 
		this.s.dt.oScroller = this;

		/* Let's do it */
		this._fnConstruct();
	};


	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Private methods (they are of course public in JS, but recommended as private)
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * Initialisation for Scroller
	 *  @returns {void}
	 *  @private
	 */
	Scroller.prototype._fnConstruct = function () {
		var that = this;

		/* Sanity check */
		if (!this.s.dt.oFeatures.bPaginate) {
			this.s.dt.oApi._fnLog(this.s.dt, 0, 'Pagination must be enabled for Scroller');
			return;
		}

		/* Insert a div element that we can use to force the DT scrolling container to
		 * the height that would be required if the whole table was being displayed
		 */
		this.dom.force.style.position = "relative";
		this.dom.force.style.top = "0px";
		this.dom.force.style.left = "0px";
		this.dom.force.style.width = "1px";

		this.dom.scroller = $('div.' + this.s.dt.oClasses.sScrollBody, this.s.dt.nTableWrapper)[0];
		this.dom.scroller.appendChild(this.dom.force);
		this.dom.scroller.style.position = "relative";

		this.dom.table = $('>table', this.dom.scroller)[0];
		this.dom.table.style.position = "absolute";
		this.dom.table.style.top = "0px";
		this.dom.table.style.left = "0px";

		// Add class to 'announce' that we are a Scroller table
		$(this.s.dt.nTableWrapper).addClass('DTS');

		/* In iOS we catch the touchstart event in case the user tries to scroll
		 * while the display is already scrolling
		 */
		$(this.dom.scroller).on('touchstart.DTS scroll.DTS',
			this.c.serverThrottle ?
			$.fn.dataTable.util.throttle(this._fnScroll.bind(this), that.c.serverThrottle) :
			this._fnScroll.bind(this));

		var draw = this._fnDrawCallback.bind(this);
		var adjust = $.fn.dataTable.util.throttle(function() {
			this.fnMeasure();
			this.dt.columns.adjust();
			if (this.s.dt.responsive) {
				this.dt.responsive.recalc();
			}
		}.bind(this), 500);
		var fnUpdate = this.s.dt.oApi._fnUpdateInfo.bind(null, this.s.dt);

		// Hack to render select info without flickering
		if (this.s.dt.oInit.select && (!this.s.dt.oInit.select.hasOwnProperty("info") || this.s.dt.oInit.select.info)) {
			if (this.s.dt.oInit.select === true) {
				this.s.dt.oInit.select = {
					style: "os"
				};
			}
			this.s.dt.oInit.select.info = false;
			this.s.selectInfo = true;

			this.dt.on("select deselect", fnUpdate);
		}

		this.fnMeasure();		

		$(window).on("resize", adjust);
		this.dt.on('draw.dt', draw);

		/* Destructor */
		this.dt.one('destroy.dt', function (e, settings) {
			$(that.dom.scroller).off('touchstart.DTS scroll.DTS');
			that.dt.off('draw.dt', draw);
			that.dt.off('select deselect', fnUpdate);						
			$(window).off('resize', adjust);
			$(that.s.dt.nTableWrapper).removeClass('DTS');
			that.dom.table.style.position = "";
			that.dom.table.style.top = "";
			that.dom.table.style.left = "";
		});
	};

	/**
	 * Calculate and store information about how many rows are to be displayed
	 * in the scrolling viewport, based on current dimensions in the browser's
	 * rendering. This can be particularly useful if the table is initially
	 * drawn in a hidden element - for example in a tab.
	 *  @param {bool} [bRedraw=true] Redraw the table automatically after the recalculation, with
	 *    the new dimensions forming the basis for the draw.
	 *  @returns {void}
	 *  @example
	 *    $(document).ready(function() {
	 *      // Make the example container hidden to throw off the browser's sizing
	 *      document.getElementById('container').style.display = "none";
	 *      var oTable = $('#example').dataTable( {
	 *        "sScrollY": "200px",
	 *        "sAjaxSource": "media/dataset/large.txt",
	 *        "sDom": "frtiS",
	 *        "bDeferRender": true,
	 *        "fnInitComplete": function (o) {
	 *          // Immediately scroll to row 1000
	 *          o.oScroller.fnScrollToRow( 1000 );
	 *        }
	 *      } );
	 *     
	 *      setTimeout( function () {
	 *        // Make the example container visible and recalculate the scroller sizes
	 *        document.getElementById('container').style.display = "block";
	 *        oTable.fnSettings().oScroller.fnMeasure();
	 *      }, 3000 );
	 */
	Scroller.prototype.fnMeasure = function () {
		this._fnAutoHeight();				

		var rowHeight = this.s.rowHeight;
		if (this.c.rowHeight && this.c.rowHeight != 'auto') {
			this.s.rowHeight = this.c.rowHeight;
		} else {
			this.s.rowHeight = this._fnCalcRowHeight();
		}

		var viewportRows = this.s.viewportRows;

		var viewport = $.contains(document, this.dom.scroller) ?
			$(this.dom.scroller).height() :
			this._parseHeight($(this.dom.scroller).css('height'));

		// If collapsed (no height) use the max-height parameter
		if (!viewport) {
			viewport = this._parseHeight($(this.dom.scroller).css('max-height'));
		}

		this.s.viewportRows = Math.min(Math.floor(viewport / this.s.rowHeight));
		this.s.dt._iDisplayLength = this.s.viewportRows + 2 * this.s.viewportRows * this.c.displayBuffer;

		if (viewportRows !== this.s.viewportRows || (rowHeight !== 0 && rowHeight !== this.s.rowHeight)) {
			this._fnScroll();
		}
	};

	Scroller.prototype._fnAutoHeight = function() {
		if(this.s.dt.oInit.scrollY !== "auto") {
			return;
		}
		$(".dataTables_scrollBody", this.s.dt.nTableWrapper).css(this.s.dt.oInit.scrollCollapse ? 'max-height' : 'height',"0");		
		var height = $(this.s.dt.nTableWrapper).parent().innerHeight()-$(this.s.dt.nTableWrapper).outerHeight()-10;
		$(".dataTables_scrollBody", this.s.dt.nTableWrapper).css(this.s.dt.oInit.scrollCollapse ? 'max-height' : 'height',Math.floor(height)+"px");
	}

	/**
	 * Scrolling function - fired whenever the scrolling position is changed.
	 * This method needs to use the stored values to see if the table should be
	 * redrawn as we are moving towards the end of the information that is
	 * currently drawn or not. If needed, then it will redraw the table based on
	 * the new position.
	 *  @returns {void}
	 *  @private
	 */
	Scroller.prototype._fnScroll = function () {
		var rowHeight = this.s.rowHeight;
		var length = this.s.dt._iDisplayLength;
		var scrollTop = this.dom.scroller.scrollTop;
		var rows = this.s.viewportRows;
		var scale = this.c.boundaryScale;
		var buffer = this.c.displayBuffer;
		var max = this.s.dt.fnRecordsDisplay() - length;
		var iTopRow = scrollTop / rowHeight - buffer * rows;
		var redrawTop = this.s.redrawTop;
		var redrawBottom = this.s.redrawBottom;

		iTopRow = Math.min(iTopRow, max);
		iTopRow = Math.max(iTopRow, 0);
		iTopRow = Math.floor(iTopRow);
		if (iTopRow % 2 !== 0) {
			// For the row-striping classes (odd/even) we want only to start
			// on evens otherwise the stripes will change between draws and
			// look rubbish
			iTopRow === max ? iTopRow++ : iTopRow--;
		}

		/* Check if the scroll point is outside the trigger boundary which
		 * would required a DataTables redraw with changed display start
		 */
		if (scrollTop < redrawTop || scrollTop >= redrawBottom) {
			this.s.redrawTop = iTopRow <= 0 ? -1 : (iTopRow + length * (1 - scale) - rows / 2) * rowHeight;
			this.s.redrawBottom = iTopRow >= max ? (max+length) * rowHeight + 1 : (iTopRow + length * scale - rows / 2) * rowHeight;

			console.log(this.s.redrawBottom, iTopRow, max, scrollTop, this.s.redrawTop)
			// Do the DataTables redraw based on the calculated start point,
			// except if _fnScroll is called as part of the initialisation
			if (redrawBottom !== 0 || redrawTop !== 0) {
				this.s.dt._iDisplayStart = iTopRow;
				this.s.dt.oApi._fnDraw(this.s.dt);
			}
		}

		// Upate the info text, except if _fnScroll is
		// called as part of the initialisation
		if (redrawBottom !== 0 || redrawTop !== 0) {
			this.s.dt.oApi._fnUpdateInfo(this.s.dt);
		}
	};

	/**
	 * Parse CSS height property string as number
	 *
	 * An attempt is made to parse the string as a number. Currently supported units are 'px',
	 * 'vh', and 'rem'. 'em' is partially supported; it works as long as the parent element's
	 * font size matches the body element. Zero is returned for unrecognized strings.
	 *  @param {string} cssHeight CSS height property string
	 *  @returns {number} height
	 *  @private
	 */
	Scroller.prototype._parseHeight = function (cssHeight) {
		var height;
		var matches = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|em|rem|vh)$/.exec(cssHeight);

		if (matches === null) {
			return 0;
		}

		var value = parseFloat(matches[1]);
		var unit = matches[2];

		if (unit === 'px') {
			height = value;
		} else if (unit === 'vh') {
			height = (value / 100) * $(window).height();
		} else if (unit === 'rem') {
			height = value * parseFloat($(':root').css('font-size'));
		} else if (unit === 'em') {
			height = value * parseFloat($('body').css('font-size'));
		}

		return height ?
			height :
			0;
	};


	/**
	 * Draw callback function which is fired when the DataTable is redrawn. The main function of
	 * this method is to position the drawn table correctly the scrolling container for the rows
	 * that is displays as a result of the scrolling position.
	 *  @returns {void}
	 *  @private
	 */
	Scroller.prototype._fnDrawCallback = function () {
		var heights = this.s.rowHeight;
		var displayStart = this.s.dt._iDisplayStart;

		// Resize the scroll forcing element
		var height = heights * Math.max(this.s.dt.fnRecordsDisplay(), 1) + 'px';
		if (height !== this.dom.force.style.height) {
			this.dom.force.style.height = height;
			this.dt.columns.adjust();
			if (this.s.dt.responsive) {
				this.dt.responsive.recalc();
			}
		}

		this.dom.table.style.top = (displayStart * heights) + 'px';		
	};

	/**
	 * Automatic calculation of table row height. This is just a little tricky here as using
	 * initialisation DataTables has tale the table out of the document, so we need to create
	 * a new table and insert it into the document, calculate the row height and then whip the
	 * table out.
	 *  @returns {void}
	 *  @private
	 */
	Scroller.prototype._fnCalcRowHeight = function () {
		var dt = this.s.dt;
		var origTable = dt.nTable;
		var nTable = origTable.cloneNode(false);
		var tbody = $('<tbody/>').appendTo(nTable);
		var container = $(
			'<div class="' + dt.oClasses.sWrapper + ' DTS">' +
			'<div class="' + dt.oClasses.sScrollWrapper + '">' +
			'<div class="' + dt.oClasses.sScrollBody + '"></div>' +
			'</div>' +
			'</div>'
		);

		// Want 3 rows in the sizing table so :first-child and :last-child
		// CSS styles don't come into play - take the size of the middle row
		$('tbody tr:lt(4)', origTable).clone().appendTo(tbody);
		while ($('tr', tbody).length < 3) {
			tbody.append('<tr><td>&nbsp;</td></tr>');
		}

		$('div.' + dt.oClasses.sScrollBody, container).append(nTable);

		// If initialised using `dom`, use the holding element as the insert point
		var insertEl = this.s.dt.nHolding || origTable.parentNode;

		if (!$(insertEl).is(':visible')) {
			insertEl = 'body';
		}

		container.appendTo(insertEl);
		let height = $('tr', tbody).eq(1).outerHeight();
		container.remove();
		return height;
	};


	/**
	 * Update any information elements that are controlled by the DataTable based on the scrolling
	 * viewport and what rows are visible in it. This function basically acts in the same way as
	 * _fnUpdateInfo in DataTables, and effectively replaces that function.
	 *  @returns {void}
	 *  @private
	 */
	Scroller.prototype._fnInfoCallback = function () {
		/* Show information about the table */
		var settings = this.s.dt;
		var nodes = settings.aanFeatures.i;
		if (nodes.length === 0) {
			return;
		}

		var data = this.dt.page.info();

		var
			lang = settings.oLanguage,
			out = data.recordsDisplay ?
			lang.sInfo :
			lang.sInfoEmpty;

		if (data.recordsDisplay !== data.recordsTotal) {
			/* Record set after filtering */
			out += ' ' + lang.sInfoFiltered;
		}

		// Convert the macros
		out += lang.sInfoPostFix;

		// When infinite scrolling, we are always starting at 1. _iDisplayStart is used only
		// internally
		var
			formatter = settings.fnFormatNumber,
			start = data.start + 1,
			all = data.length === -1;


		return out.
		replace(/_START_/g, formatter.call(settings, start)).
		replace(/_END_/g, formatter.call(settings, data.end)).
		replace(/_MAX_/g, formatter.call(settings, data.recordsTotal)).
		replace(/_TOTAL_/g, formatter.call(settings, data.recordsDisplay)).
		replace(/_PAGE_/g, formatter.call(settings, all ? 1 : Math.ceil(start / data.length))).
		replace(/_PAGES_/g, formatter.call(settings, all ? 1 : Math.ceil(data.recordsDisplay / data.length))) +
			this._fnInfoSelect();
	};

	/**
	 * Add Support for select plugin without flickering (Hack)
	 *  @returns {void}
	 *  @private
	 */
	Scroller.prototype._fnInfoSelect = function () {

		var ctx = this.s.dt;
		var api = this.dt;

		if (!this.s.selectInfo) {
			return;
		}

		if (!ctx.aanFeatures.i) {
			return;
		}

		if (api.select.style() === 'api') {
			return;
		}

		var rows = api.rows({
			selected: true
		}).flatten().length;
		var columns = api.columns({
			selected: true
		}).flatten().length;
		var cells = api.cells({
			selected: true
		}).flatten().length;

		var add = function (name, num) {
			return api.i18n(
				'select.' + name + 's', {
					_: '%d ' + name + 's selected',
					0: '',
					1: '1 ' + name + ' selected'
				},
				num
			);
		};

		var out = '<span class="select-item">';

		// Internal knowledge of DataTables to loop over all information elements
		$.each(ctx.aanFeatures.i, function (i, el) {
			out += add('row', rows);
			out += add('column', columns);
			out += add('cell', cells);
		});

		return out + '</span>';
	};

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Statics
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */


	/**
	 * Scroller default settings for initialisation
	 *  @namespace
	 *  @name Scroller.defaults
	 *  @static
	 */
	Scroller.defaults = /** @lends Scroller.defaults */ {
		/**
		 * Scroller will attempt to automatically calculate the height of rows for it's internal
		 * calculations. However the height that is used can be overridden using this parameter.
		 *  @type     int|string
		 *  @default  auto
		 *  @static
		 *  @example
		 *    var oTable = $('#example').dataTable( {
		 *        "sScrollY": "200px",
		 *        "sDom": "frtiS",
		 *        "bDeferRender": true,
		 *        "oScroller": {
		 *          "rowHeight": 30
		 *        }
		 *    } );
		 */
		"rowHeight": "auto",

		/**
		 * When using server-side processing, Scroller will throttle with a small amount of time to allow
		 * the scrolling to finish before requesting more data from the server. This prevents
		 * you from DoSing your own server! The wait time can be configured by this parameter.
		 *  @type     int
		 *  @default  200
		 *  @static
		 *  @example
		 *    var oTable = $('#example').dataTable( {
		 *        "sScrollY": "200px",
		 *        "sDom": "frtiS",
		 *        "bDeferRender": true,
		 *        "oScroller": {
		 *          "serverThrottle": 100
		 *        }
		 *    } );
		 */
		"serverThrottle": 200,

		/**
		 * The display buffer is what Scroller uses to calculate how many rows it should pre-fetch
		 * for scrolling. Scroller automatically adjusts DataTables' display length to pre-fetch
		 * rows that will be shown in "near scrolling" (i.e. just beyond the current display area).
		 * The value is based upon the number of rows that can be displayed in the viewport (i.e.
		 * a value of 1), and will apply the display range to records before before and after the
		 * current viewport - i.e. a factor of 2 will allow Scroller to pre-fetch 2 viewport's worth
		 * of rows before the current viewport, the current viewport's rows and 2 viewport's worth
		 * of rows after the current viewport. Adjusting this value can be useful for ensuring
		 * smooth scrolling based on your data set.
		 *  @type     int
		 *  @default  7
		 *  @static
		 *  @example
		 *    var oTable = $('#example').dataTable( {
		 *        "sScrollY": "200px",
		 *        "sDom": "frtiS",
		 *        "bDeferRender": true,
		 *        "oScroller": {
		 *          "displayBuffer": 10
		 *        }
		 *    } );
		 */
		"displayBuffer": 2,

		/**
		 * Scroller uses the boundary scaling factor to decide when to redraw the table - which it
		 * typically does before you reach the end of the currently loaded data set (in order to
		 * allow the data to look continuous to a user scrolling through the data). If given as 0
		 * then the table will be redrawn whenever the viewport is scrolled, while 1 would not
		 * redraw the table until the currently loaded data has all been shown. You will want
		 * something in the middle - the default factor of 0.5 is usually suitable.
		 *  @type     float
		 *  @default  0.5
		 *  @static
		 *  @example
		 *    var oTable = $('#example').dataTable( {
		 *        "sScrollY": "200px",
		 *        "sDom": "frtiS",
		 *        "bDeferRender": true,
		 *        "oScroller": {
		 *          "boundaryScale": 0.75
		 *        }
		 *    } );
		 */
		"boundaryScale": 0.5,
	};

	Scroller.oDefaults = Scroller.defaults;



	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Constants
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * Scroller version
	 *  @type      String
	 *  @default   See code
	 *  @name      Scroller.version
	 *  @static
	 */
	Scroller.version = "2.1.3";

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * Initialisation
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	// Attach a listener to the document which listens for DataTables initialisation
	// events so we can automatically initialise
	$(document).on('preInit.dt', function (e, settings) {
		if (e.namespace !== 'dt') {
			return;
		}

		var init = settings.oInit.scroller;
		var defaults = $.fn.dataTable.defaults.scroller;

		if (init || defaults) {
			var opts = $.extend({}, init, defaults);

			if (init !== false) {
				new Scroller(settings, opts);
			}
		}
	});


	// DataTables 1.10 API method aliases
	var Api = $.fn.dataTable.Api;

	Api.register('page.info()', function () {

		if (this.context.length === 0) {
			return undefined;
		}

		var
			settings = this.context[0],
			start = settings.oScroller ? Math.ceil(settings.oScroller.dom.scroller.scrollTop / settings.oScroller.s.rowHeight) : settings._iDisplayStart,
			len = settings.oScroller ? settings.oScroller.s.viewportRows : settings.oFeatures.bPaginate ? settings._iDisplayLength : -1,
			visRecords = settings.fnRecordsDisplay(),
			all = len === -1;
			
		return {
			"page": all ? 0 : Math.floor(start / len),
			"pages": all ? 1 : Math.ceil(visRecords / len),
			"start": start,
			"end": settings.oScroller ? Math.min(start + len, visRecords) : settings.fnDisplayEnd(),
			"length": len,
			"recordsTotal": settings.fnRecordsTotal(),
			"recordsDisplay": visRecords,
			"serverSide": settings.oApi._fnDataSource(settings) === 'ssp'
		};
	});

	return Scroller;
}));