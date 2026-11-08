// Requires: jQuery

jQuery(document).ready(function() {
    jQuery('#mainheader .menuButton').click(function(){
        jQuery('#mainheader').toggleClass('menuOpen');
    });

    jQuery('#mainheader .menuScrim').click(function(){
        jQuery('#mainheader').removeClass('menuOpen');
    });

    jQuery('#mainheader #access .menu-item-has-children, #mainheader #access .page_item_has_children').click(function(event){
        event.stopPropagation();
        if(jQuery(event.target).hasClass('menu-item-has-children') || jQuery(event.target).hasClass('page_item_has_children')){
            if(jQuery(event.target).hasClass('subOpen')){
                jQuery(event.target).removeClass('subOpen')
                jQuery(event.target).siblings('.menu-item-has-children').removeClass('subOpen')
                jQuery(event.target).siblings('.page_item_has_children').removeClass('subOpen')
            }else{
                jQuery(event.target).siblings('.menu-item-has-children').removeClass('subOpen')
                jQuery(event.target).siblings('.page_item_has_children').removeClass('subOpen')
                jQuery(event.target).addClass('subOpen')
            }
        }
    });

});

jQuery(window).resize(function(){
    jQuery('.headerspacer').css('height', jQuery('#mainheader').outerHeight()+'px');
    if(jQuery(window).width() >= 1024){
        jQuery('#mainheader').removeClass('menuOpen');
        jQuery('#mainheader .subOpen').removeClass('subOpen');
    }
});

var lastScrollTop = 0;

jQuery(window).scroll(function() {
    var st = jQuery(this).scrollTop();
    if (st > 0 && st > lastScrollTop){
        jQuery('#mainheader').addClass('hideTop');
    } else {
        jQuery('#mainheader').removeClass('hideTop');
    }
    lastScrollTop = st;
});

window.zESettings={webWidget:{color:{theme:"#ffa300"}}};

const swiper = new Swiper('.swiper-container', {
    slidesPerView: 1,        // Display 3 images at a time
    slidesPerGroup: 1,
    spaceBetween: 20,        // Adjust space between images
    loop: true,              // Infinite loop scrolling
    speed: 2000,
    autoplay: {
        delay: 5000,         // Slide changes every 2 seconds
        disableOnInteraction: false // Keeps autoplay even after interaction
    },
    navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev'
    },
    breakpoints: {
        550: {
            slidesPerView: 2, // Show 2 slides on medium screens (e.g. tablets)
            slidesPerGroup: 2
        },
        768: {
            slidesPerView: 3, // Show 3 slides on larger screens (e.g. desktops)
            slidesPerGroup: 3,
        }
    }

});