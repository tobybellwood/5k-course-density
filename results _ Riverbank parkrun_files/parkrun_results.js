$ = jQuery;

'use strict';

//polyfill for includes
if (!Array.prototype.includes) {
    Object.defineProperty(Array.prototype, "includes", {
        value: function (searchElement, fromIndex) {
            if (this == null) {
                throw new TypeError('"this" is null or not defined');
            }

            // 1. Let O be ? ToObject(this value).
            var o = Object(this);

            // 2. Let len be ? ToLength(? Get(O, "length")).
            var len = o.length >>> 0;

            // 3. If len is 0, return false.
            if (len === 0) {
                return false;
            }

            // 4. Let n be ? ToInteger(fromIndex).
            //    (If fromIndex is undefined, this step produces the value 0.)
            var n = fromIndex | 0;

            // 5. If n ≥ 0, then
            //  a. Let k be n.
            // 6. Else n < 0,
            //  a. Let k be len + n.
            //  b. If k < 0, let k be 0.
            var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);

            function sameValueZero(x, y) {
                return (
                    x === y ||
                    (
                        typeof x === "number" &&
                        typeof y === "number" &&
                        isNaN(x) &&
                        isNaN(y)
                    )
                );
            }

            // 7. Repeat, while k < len
            while (k < len) {
                // a. Let elementK be the result of ? Get(O, ! ToString(k)).
                // b. If SameValueZero(searchElement, elementK) is true, return true.
                if (sameValueZero(o[k], searchElement)) {
                    return true;
                }
                // c. Increase k by 1.
                k++;
            }

            // 8. Return false
            return false;
        },
    });
}

if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
        "use strict";
        if (search instanceof RegExp) {
            throw TypeError("first argument must not be a RegExp");
        }
        if (start === undefined) {
            start = 0;
        }
        return this.indexOf(search, start) !== -1;
    };
}

(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define(["jquery"], factory);
    } else if (typeof exports === "object") {
        module.exports = factory(require("jquery"));
    } else {
        factory(root.jQuery);
    }

}(this, function ($) {
    /**
    * Results Widget
    */
    $.widget('nsm.results', {

        /**
        * Options
        */
        options: {
            fields: [],
            unknown: '',
            defaultSort: '',
            cookies: null,
            displayPreference: '',
            compareTypes: ['event','country','date','male','female'] // TODO: Add name(participant) - work required to deal with 'composite' filtering. E.g. name filters used in conjunction with ageCategory, 
            // to essentially apply the filter 'compareTypes' using OR and others as AND
        },

        /**
        * Create the widget
        *
        * @see http://api.jqueryui.com/jQuery.widget/#method-_create
        * @private
        */
        _create: function () {
            var widget = this;
            var fields = widget.element.data('fields');
            fields.forEach(function(item) {
                widget.options.fields[item] = widget.element.data(item);
            });

            widget.options.unknown = widget.element.data('unknown');
            widget.options.defaultSort = widget.element.data('defaultSort');

            widget.$resultsSearch = $('.js-ResultsSearch', widget.element)
            widget.$resultsTable = $('.js-ResultsTable', widget.element)
            widget.$resultsTbody = $('.js-ResultsTbody', widget.element)
            widget.$resultsSelect = $('.js-ResultsSelect', widget.element)
            widget.$resultsSortSelect = widget.$resultsSelect.filter('[name="sort"]')
            widget.$resultsModal = $('.js-ResultsModal', widget.element)
            widget.$resultsModalOpen = $('.js-ResultsModalOpen', widget.element)
            widget.$resultsModalClose = $('.js-ResultsModalClose', widget.element)
            widget.$resultsDialog = $('.js-ResultsDialog, .js-ResultsScrim', widget.element)
            widget.$resultsDialogOpen = $('.js-ResultsDialogOpen', widget.element)
            widget.$resultsDialogClose = $('.js-ResultsDialogClose', widget.element)
            widget.$resultsOption = $('.js-ResultsOption', widget.element)
            widget.$resultsRows = $('.Results-table-row', widget.element)
            widget.$resultsVisibleRows = widget.$resultsRows
            widget.$resultsFilters = $('.js-ResultsFilters', widget.element)
            widget.$resultsFiltersSpacer = $('.js-ResultsFiltersSpacer', widget.element)
            widget.$resultsUnknown = widget.$resultsRows.filter(function(index, element){
                return this.dataset.name === widget.options.unknown;
            })

            widget.$resultsModalOpen.click(function(){
                widget.$resultsModal.addClass('isOpen');
            });

            widget.$resultsModalClose.click(function(){
                widget.$resultsModal.removeClass('isOpen');
            });

            var options = widget._getSelectizeOptions();
            var optGroups = [];
            fields.forEach(function(item) {
                optGroups.push({
                    id: item,
                    name: widget.element.data(item),
                })
            });

            var $select = widget.$resultsSearch.selectize({
                options: options,
                optGroups: optGroups,
                labelField: 'displayId',
                valueField: 'id',
                optgroupField: 'type',
                optgroupLabelField: 'name',
                optgroupValueField: 'id',
                optgroupOrder: fields,
                searchField: ['value','altName'],
                plugins: ['remove_button'],
                openOnFocus: false,
                delimiter: '|',
                render: {
                    option: function(item, escape) {
                        return '<div class="option">' +
                        '<span class="value">' + escape(item.value) + '</span>' +
                        '<span class="type type--' + escape(item.type) + '">' + widget.options.fields[item.type] + '</span>' +
                        '</div>';
                    },
                    item: function(item, escape) {
                        if(item.type.charAt(0) === '_' ){
                            return '<div class="item item--hidden"> </div>';
                        }
                        return '<div class="item item--' + escape(item.type) + '">' +
                        '<span class="filter-type ' + ( item.displayId.length==0 ? 'filter-compare' : '') + '">' + escape(item.displayId) + ': </span><span class="filter-value">' + escape(item.value) + '</span>' +
                        // ( item.count != undefined ? ' ('+item.count+')' : '' ) +
                        '<a href="javascript:void(0)" class="remove" tabindex="-1" title="Remove">×</a>' +
                        '</div>';
                        
                    },
                },
            });


            var selectize = $select[0].selectize;

            selectize.on('item_add', function(value, $item){
                var compare = ( widget.options.compareTypes.includes(value.split(':')[0]) );

                if(compare==false){
                    var query = value.split(': ');
                    for (var i=0;i<options.length; i++) {
                        if(options[i].type === query[0].toLowerCase().replace(/\s/g, '') && value != options[i].id){
                            selectize.removeOption(options[i].id)
                        }
                    }
                    setTimeout(function(){
                        selectize.refreshOptions();
                        selectize.close();
                    }, 1)
                }
            });

            selectize.on('item_remove', function(value){
                var query = value.split(': ');
                for (var i=0;i<options.length; i++) {
                    if(options[i].type === query[0].toLowerCase().replace(/\s/g, '')){
                        // console.log(options[i]);
                        selectize.addOption({
                            id: options[i].id,
                            displayId: options[i].displayId,
                            type: options[i].type,
                            value: options[i].value,
                            altName: ( options[i].altName !== undefined ? options[i].altName : ''),
                            count:  ( options[i].count !== undefined ? options[i].count : ''),
                        })
                    }
                }
                setTimeout(function(){
                    selectize.refreshOptions();
                    selectize.close();
                }, 1)
            });

            widget.$resultsDialogOpen.click(function(){
                widget.$resultsDialog.addClass('isOpen');
            });

            widget.$resultsDialogClose.click(function(){
                widget.$resultsDialog.removeClass('isOpen');
            });

            widget.$resultsSelect.change(function(){
                // console.log(this);
                var target = $(this);
                var filteredOptions = widget.$resultsOption.filter('[data-value="'+target.val()+'"]');
                filteredOptions.siblings().removeClass('isSelected');
                filteredOptions.addClass('isSelected');
                setTimeout(function(){
                    widget._handleOptionSelect(target.attr('name'), target.val());
                }, 1);
            });

            widget.$resultsOption.click(function(event){
                var target = $(this);
                // console.log(this);

                // if(target.attr('class') === 'flip'){
                if(target.hasClass('flip')){
                    // if js-ResultsOption has data-name flip, then reverse the previous sort order, and use 'this' sort attribute 
                    var previousState = $('.js-ResultsSelect[name=sort] option:selected')[0];
                    if(previousState===undefined){
                        var dir = 'asc';
                    }else{
                        tmp = previousState.value.split('-');
                        var dir = (tmp[1]==='asc' ? 'desc' : 'asc');
                    }
                    var att = $(event.target).data('value').split('-')[0];
                    $(event.target).data('value', att + '-' + dir );
                }

                target.siblings().removeClass('isSelected');
                target.addClass('isSelected');
                if($(event.target).hasClass('js-ResultsDirection')){                    
                    selectDirection($(event.target), target.parent());
                }else{
                    setTimeout(function(){
                        if(target[0].hasAttribute('data-value')){
                            widget.$resultsSelect.filter('[name="'+target.parent().data('name')+'"]').val(target.data('value'));
                            widget._handleOptionSelect(target.parent().data('name'), target.data('value'));
                        }else{
                            selectDirection(target.find('.js-ResultsDirection:first-child'), target.parent());
                        }
                    }, 1);
                }
            });

            var sortValue = widget.$resultsSortSelect.val();
            if(sortValue != widget.options.defaultSort){
                widget.$resultsSelect.change();
            }

            function selectDirection(t, parent){
                parent.find('.js-ResultsDirection').removeClass('isSelected');
                t.addClass('isSelected');
                widget.$resultsSelect.filter('[name="'+parent.data('name')+'"]').val(t.data('value'));
                setTimeout(function(){
                    widget._handleOptionSelect(parent.data('name'), t.data('value'));
                }, 1);
            }

            widget.$resultsSearch.change(function(){
                // TODO: Sort Day filter tags Mon-Sun
                //console.time('results:filter')
                var sortValue = widget.$resultsSortSelect.val();
                var searchValue = widget.$resultsSearch.val();
                widget.$resultsVisibleRows = widget.$resultsRows;
                if(searchValue !== ''){
                    widget.$resultsRows.detach();
                    var queries = searchValue.split('|');

                    // Determine whether to remove the item type from the available filters remaining
                    var compare = ( queries != undefined && widget.options.compareTypes.includes(queries[0].split(':')[0]) );

                    var selectors = [];
                    if(compare){
                        selectors.push(queries);
                    }
                    for (var i=0;i<queries.length; i++) {
                        var query = queries[i].split(': ');
                        selectors.push(query);
                    }

                    if (selectors.length == 2 || compare==false){
                        widget.$resultsVisibleRows = widget.$resultsRows.filter(function(index, element){
                            var matched = true;
                            for (var i=0;i<selectors.length; i++) {
                                if(element.dataset[selectors[i][0]] !== selectors[i][1]){
                                    matched = false;
                                }
                            }
                            return matched;
                        });
                    }else{                        
                        widget.$resultsVisibleRows = widget.$resultsRows.filter(function(index, element){
                            var matched = false;
                            for (var i=0;i<selectors.length; i++) {
                                if(element.dataset[selectors[i][0]] == selectors[i][1]){
                                    matched = true;
                                }
                            }
                            return matched;
                        });
                    }
                }
                widget.$resultsTbody.append(widget.$resultsVisibleRows)
                widget._handleOptionSelect('sort', sortValue)
                //console.timeEnd('results:filter')
            });

            if(parkrunResultsData.genderCounts){
                $.each( parkrunResultsData.genderCounts, function( key, value ) {
                    widget.element.find('.Results-table--genderCount').filter(function(index, element){
                        return element.dataset.gender === key
                    }).text('/' + value)
                });
            }

            var lastScrollTop = 0;
            $(window).scroll(function(){
                var target = $(this);
                var st = target.scrollTop() !== undefined ? target.scrollTop() : 0;
                if (st > 0 && st > lastScrollTop){
                    widget._handleScrollDown(st);
                } else {
                    widget._handleScrollUp(st);
                }
                lastScrollTop = st;
            });

            var locale = navigator.language;

            $.each($('.format-int'), function (index, item) {
                let num = parseFloat(item.innerHTML);
                num = num.toLocaleString( locale , {useGrouping: true} );
                item.innerHTML = num;
            });

            $.each($('.format-date'), function (index, item) {
                let date = Date.parseExact(item.innerHTML,['yyyy-MM-dd','dd/MM/yyyy']);
                date = date.toLocaleDateString( locale , {dateStyle: 'short'} );
                item.innerHTML = date;
            });

        },
        _destroy: function () {
            var widget = this;
        },
        _setOption: function(key, value) {
            var widget = this;
            widget._super( key, value );
        },
        _handleOptionSelect: function(name, value){
            var widget = this;

            if(name === 'display'){

                //console.time('results:display')
                // persist most recent display settings (compact|detailed)
                if(!widget.options.displayPreference){  // page load, not display click toggle
                    var displayPreferencePrevious = widget.options.cookies.get('parkrun-results-table-display-preference');
                    if(displayPreferencePrevious == undefined){  // new visitor
                        widget.options.displayPreference = value;
                    }else{  // restore display from previous
                        value = displayPreferencePrevious;
                        ($('.js-ResultsSelect[name="display"]')[0]).value = value;  // select list for Tablet/Desktop
                        ($('.Results-dialog-option.js-ResultsOption[data-value="'+value+'"]'))[0].click(); // button for mobile
                        widget.options.displayPreference = value;
                    }
                }else{
                    // determine if personalisation cookies are permitted
                    try {
                        const cookies = `; ${document.cookie}`;
                        const name = window.psc.settings.cookie.name;
                        const parts = cookies.split(`; ${name}=`);
                        if (parts.length === 2){
                            let psc = JSON.parse(decodeURIComponent(parts.pop().split(';').shift()));
                            if(psc.categories.includes('personalisation')){
                                //  changed display, persist as new preference
                                this.options.cookies.set(
                                    'parkrun-results-table-display-preference',
                                    value,
                                    {    
                                        expires:3652,    
                                    }
                                );
                            }
							// TODO: hook on psc change to allow personalisation to then set display preference cookie if not default
                        }
                    } catch (error) {
                        console.error('Error setting display preference cookie:', error);
                    }
                }

                var filteredSelects = widget.$resultsSelect.filter('[name="display"]');
                filteredSelects.parent().removeClass('Results-filters-select--icon-compact Results-filters-select--icon-detailed');
                filteredSelects.parent().addClass('Results-filters-select--icon-' + value);
                if(value === 'detailed'){
                    widget.$resultsTable.addClass('Results-table--detailed').removeClass('Results-table--compact')
                }else{
                    widget.$resultsTable.addClass('Results-table--compact').removeClass('Results-table--detailed')
                }
                //console.timeEnd('results:display')
            }else if(name === 'sort'){
                //console.time('results:sort')
                if(value === 'runs-asc'){
                    widget.$resultsVisibleRows.sort(customSort('runs', 'asc', false, 'position', 'asc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'runs-desc'){
                    widget.$resultsVisibleRows.sort(customSort('runs', 'desc', false, 'position', 'asc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'agegrade-asc'){
                    widget.$resultsVisibleRows.sort(customSort('agegrade', 'asc', false, 'position', 'asc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'agegrade-desc'){
                    widget.$resultsVisibleRows.sort(customSort('agegrade', 'desc', false, 'position', 'asc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'position-asc'){
                    if(widget.$resultsSearch.val() === ''){
                        widget.$resultsTbody.append(widget.$resultsUnknown);
                    }
                    widget.$resultsVisibleRows.sort(customSort('position', 'asc', true, null, null)).appendTo('.js-ResultsTable');
                } else if(value === 'position-desc'){
                    if(widget.$resultsSearch.val() === ''){
                        widget.$resultsTbody.append(widget.$resultsUnknown);
                    }
                    widget.$resultsVisibleRows.sort(customSort('position', 'desc', true, null, null)).appendTo('.js-ResultsTable');
                } else if(value === 'finishers-asc'){
                    widget.$resultsVisibleRows.sort(customSort('finishers', 'asc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'finishers-desc'){
                    widget.$resultsVisibleRows.sort(customSort('finishers', 'desc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'volunteers-asc'){
                    widget.$resultsVisibleRows.sort(customSort('volunteers', 'asc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'volunteers-desc'){
                    widget.$resultsVisibleRows.sort(customSort('volunteers', 'desc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'maletime-asc'){
                    widget.$resultsVisibleRows.sort(customSort('maletime', 'asc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'maletime-desc'){
                    widget.$resultsVisibleRows.sort(customSort('maletime', 'desc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'femaletime-asc'){
                    widget.$resultsVisibleRows.sort(customSort('femaletime', 'asc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'femaletime-desc'){
                    widget.$resultsVisibleRows.sort(customSort('femaletime', 'desc', false, 'parkrun', 'desc')).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value === 'parkrun-asc'){
                    if(widget.$resultsSearch.val() === ''){
                        widget.$resultsTbody.append(widget.$resultsUnknown);
                    }
                    widget.$resultsVisibleRows.sort(customSort('parkrun', 'asc', true, null, null)).appendTo('.js-ResultsTable');
                } else if(value === 'parkrun-desc'){
                    if(widget.$resultsSearch.val() === ''){
                        widget.$resultsTbody.append(widget.$resultsUnknown);
                    }
                    widget.$resultsVisibleRows.sort(customSort('parkrun', 'desc', true, null, null)).appendTo('.js-ResultsTable');
                } else if(value === 'performances-asc' || value === 'performances-desc'){
                    let attributeSortOrder = value.split('-');
                    let direction = attributeSortOrder.pop();
                    widget.$resultsVisibleRows.sort(customSort('performances', direction, false, 'thisweekperformances', direction)).appendTo('.js-ResultsTable');
                    widget.$resultsUnknown.detach();
                } else if(value !== undefined){    
                    
                    // TODO consider consolidating above into general case.
                    let direction, modifier;
                    if(value.includes('-')){
                        let attributeSortOrder = value.split('-');
                        direction = attributeSortOrder.pop();
                        modifier = attributeSortOrder.pop();
                    }else{
                        direction = 'asc';
                        modifier = value;
                    }
                    
                    widget.$resultsVisibleRows.sort(customSort(modifier, direction, true, null, null)).appendTo('.js-ResultsTable');
                    
                    if(modifier === 'eventaz'){
                        // show all events in notparkrun country results (including those with no participants for default a-z / z-a order)
                    }else{
                        widget.$resultsUnknown.detach();
                    }

                }

                if($(window).scrollTop() > widget.$resultsTable.offset().top){
                    widget._jumpToTop();
                }
                //console.timeEnd('results:sort')
            }else if(name === 'view'){                
                // toggle between country / global stats
                if('global'===value){
                    $(".event").addClass('hide');
                    $(".country").removeClass('hide');
                }else{
                    $(".event").removeClass('hide');
                    $(".country").addClass('hide');
                }
            }

            function customSort(modifier, direction, isPrimary, primary, primaryDirection){
                
                return function(a, b){

                    // if value not set, always send to the bottom (e.g. agegrade where no DOB or gender not M/F)
                    if (
                            (a.dataset[modifier] == "") && 
                            (b.dataset[modifier] == "")
                        ) return 0;
                    if( b.dataset[modifier] == "") return -1;
                    if( a.dataset[modifier] == "") return +1;
                    
                    if( isNaN(parseInt(b.dataset[modifier])) ){
                        // it's alphabetic, probably, (or blank)
                        if(direction == 'desc'){
                            return String(a.dataset[modifier]).localeCompare(String(b.dataset[modifier]));
                        }else{
                            return String(b.dataset[modifier]).localeCompare(String(a.dataset[modifier]));
                        }
                    }else{
                        // it's numeric
                        if(isPrimary){
                            return parseFloat(b.dataset[modifier]) > parseFloat(a.dataset[modifier]) ? ( (2*(direction == 'desc')) - 1 ) : ( 1 - (2*(direction == 'desc')) );
                        }else{
                            if(parseFloat(b.dataset[modifier]) === parseFloat(a.dataset[modifier])){
                                return parseFloat(b.dataset[primary]) > parseFloat(a.dataset[primary]) ? ( (2*(primaryDirection == 'desc')) - 1 ) : ( 1 - (2*(primaryDirection == 'desc')) );
                            }else{
                                return parseFloat(b.dataset[modifier]) > parseFloat(a.dataset[modifier]) ? ( (2*(direction == 'desc')) - 1 ) : ( 1 - (2*(direction == 'desc')) );
                            }
                        }
                    }
                    
                }

            }

        },
        _getSelectizeOptions: function () {
            var widget = this;
            var options = [];
            // initial population of filter items for all rows
            $.each (parkrunResultsData.options, function(type, typeOptions) {
                var compare = ( widget.options.compareTypes.includes(type) );

                $.each (typeOptions, function(index,entry){
                    
                    if(entry != null && typeof entry === 'object'){  // ensure notparkrun is backward compatible with existing results
                        var performances = entry.performances;
                        var altTags = entry.alt;  // e.g. eventLongNameLocalised, where entry.name contains eventShortName
                        var count = entry.count;
                        count = entry.count;
                        entry = entry.name;
                    }

                    if(entry !== undefined && entry !== '' ) {                        
                        var thisOption = {
                            'id': type + ': ' + entry,
                            'displayId': widget.options.fields[type], // ( compare ? '' : widget.options.fields[type] ),
                            'altName' : (altTags !== undefined ? altTags : ''),
                            'type': type,
                            'value': entry,
                            'count' : count,
                        }
                        
                        if( !widget.options.compareTypes.includes(type) || ['date','male','female'].includes(type) || performances !== undefined ){
                            options.push(thisOption);  // iff it's the country/event notparkrun table then add suggestions iff participations exist.
                            // if date (eventhistory), or filter is 'non-compare' style then add all available
                        }
                    }
                        
                })
            });

            return options;
        },
        _handleScrollDown: function (scroll) {
            var widget = this;
            if(scroll > widget.$resultsFiltersSpacer.offset().top) {
                widget.$resultsFilters.addClass('Results-filters--fixed');
            }else{
                widget.$resultsFilters.removeClass('Results-filters--fixed');
            }
            widget.$resultsTable.addClass('Results-table--hideNav');
            widget.$resultsFilters.addClass('Results-filters--hideNav');
        },
        _handleScrollUp: function (scroll) {
            var widget = this;
            if(scroll > widget.$resultsFiltersSpacer.offset().top) {
                widget.$resultsFilters.addClass('Results-filters--fixed');
            }else{
                widget.$resultsFilters.removeClass('Results-filters--fixed');
            }
            widget.$resultsTable.removeClass('Results-table--hideNav');
            widget.$resultsFilters.removeClass('Results-filters--hideNav');
        },
        _jumpToTop: function() {
            var widget = this;
            window.scrollTo(0, widget.$resultsFiltersSpacer.offset().top - widget.$resultsFilters.outerHeight());
        }
    });
}));

//console.time('results')
$('.Results').results({
    cookies: Cookies
});
//console.timeEnd('results')
