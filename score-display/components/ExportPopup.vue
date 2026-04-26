<template>
<div class="slcwd-exports" ref="ref">
    <button class="slcwd-exports-close" @click="close"><i class="las la-times"></i></button>
    <div v-for="el of downloads">
        <button class="slcwd-button" @click="() => download(el)">
            <i v-if="el.errored" class="las la-exclamation-circle slcwd-export-error"></i>
            <i v-else-if="el.isLoading" class="las la-circle-notch slcwd-spinner"></i>
            <i v-else class="las la-file-download"></i>
            {{ el.name }}
        </button>
    </div>
</div>
</template>


<script>
export default {
    emits: ['close', 'download'],
    props: {
        downloads: Object
    },
    setup(props, ctx) {
        function close() {
            ctx.emit('close')
        }

        function download(element) {
            if (element.isLoading || element.errored) return;

            element.isLoading = true;
            ctx.emit('download', element, () => {element.isLoading = false}, () => {element.errored = true})
        }

        return { close, download }
    },
  }
</script>