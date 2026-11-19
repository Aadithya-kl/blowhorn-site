/* Image lightbox for the internal site. The mechanism is layer5io/docs':
  layouts/partials/image-modal.html (a #myModal overlay with openModal and
  closeModal) plus its render-image hook: every image on an internal page
  gets click-to-see-a-larger-version behaviour in a dismissible modal. The
  modal markup lives in layouts/_partials/image-lightbox.html; this file is
  the behaviour. Two changes from upstream:
  - when the clicked image sits inside a link to an image file, the modal
    shows the link target, so a catalog thumbnail opens its full-size file
    rather than the small thumbnail;
  - the modal image takes the clicked image's alt text.
  An image inside a link to anything else (a page, a download) is left
  alone, so the click follows the link. An image opts out with
  data-modal="false". Escape closes the modal, and so does a click anywhere
  on it. */
(function () {
  'use strict';

  var IMAGE_SUFFIX = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

  function modal() {
    return document.getElementById('myModal');
  }

  function modalPic() {
    return document.getElementById('modalPic');
  }

  // The link around an image, or null.
  function linkOf(image) {
    return image.closest ? image.closest('a[href]') : null;
  }

  // True when a link's target, without its query and hash, is an image file.
  function linksToImage(link) {
    var href = link.getAttribute('href').split('#')[0].split('?')[0];
    return IMAGE_SUFFIX.test(href);
  }

  // True when a click on the image opens the modal: it has not opted out,
  // it is not the modal's own image, and it is not inside a link to
  // anything but an image file.
  function opensModal(image) {
    if (image.dataset && image.dataset.modal === 'false') return false;
    if (image.closest && image.closest('#myModal')) return false;
    var link = linkOf(image);
    return !link || linksToImage(link);
  }

  // Open the modal on the larger view of one image: the link target when
  // the image is linked to an image file, else the image the browser chose.
  // Markdown images call this from an inline onclick, so it also refuses an
  // image that does not open the modal.
  function openModal(image) {
    var box = modal();
    var pic = modalPic();
    if (!box || !pic || !opensModal(image)) return;
    var src = image.currentSrc || image.src;
    var link = linkOf(image);
    if (link && linksToImage(link)) src = link.getAttribute('href');
    if (src && src.indexOf('#') !== -1) src = src.substring(0, src.indexOf('#'));
    pic.src = src;
    pic.alt = image.alt || '';
    box.style.display = 'block';
  }

  // Close the modal.
  function closeModal() {
    var box = modal();
    var pic = modalPic();
    if (!box || !pic) return;
    pic.src = '';
    box.style.display = 'none';
  }

  // The render-image hook and the modal markup call these by name, so they
  // stay global.
  window.openModal = openModal;
  window.closeModal = closeModal;

  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function () {
    var box = modal();
    if (!box) return;

    // Attach the click to every image after the DOM is loaded. The click
    // decides at the time whether the image opens the modal (opensModal);
    // when it does not, the click does nothing here, so a link around the
    // image is followed. When it does, the default is prevented so an image
    // linked to an image file opens the modal instead of the bare file; the
    // modal shows the link target, the larger view.
    var images = document.querySelectorAll('img');
    images.forEach(function (img) {
      img.addEventListener('click', function (event) {
        if (!opensModal(img)) return;
        event.preventDefault();
        openModal(img);
      });
    });

    // Close the modal when clicking anywhere inside it.
    box.addEventListener('click', function () {
      closeModal();
    });
  });

  // Listen for the Escape key to close the modal.
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
})();
