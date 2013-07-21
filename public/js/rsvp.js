YUI.add('le-rsvp', function (Y) {

    // -- Y.Models Overrides ---------------------------------------------------

    Y.Model.prototype.promiseSave = function (options) {
        var model = this;

        return new Y.Promise(function (resolve, reject) {
            model.save(options, function (err, res) {
                return err ? reject(err) : resolve(res);
            });
        });
    };

    Y.ModelSync.REST.prototype._sendSyncIORequest = function (config) {
        return Y.io.queue(config.url, {
            'arguments': {
                action  : config.action,
                callback: config.callback,
                url     : config.url
            },

            context: this,
            data   : config.entity,
            headers: config.headers,
            method : config.method,
            timeout: config.timeout,

            on: {
                start  : this._onSyncIOStart,
                failure: this._onSyncIOFailure,
                success: this._onSyncIOSuccess,
                end    : this._onSyncIOEnd
            }
        });
    };

    // -- Models ---------------------------------------------------------------

    Y.Guest = Y.Base.create('guest', Y.Model, [Y.ModelSync.REST], {
        root: '/guests/'
    });


    Y.Guests = Y.Base.create('guests', Y.ModelList, [Y.ModelSync.REST], {
        model: Y.Guest,

        attending: function () {
            return this.filter({asList: true}, function (guest) {
                return guest.get('is_attending');
            });
        },

        invited: function () {
            return this.filter({asList: true}, function (guest) {
                return !guest.get('is_plusone');
            });
        },

        plusones: function () {
            return this.filter({asList: true}, function (guest) {
                return guest.get('is_plusone');
            });
        },

        names: function (guests) {
            return (guests || this).filter({asList: true}, function (guest) {
                return !!guest.get('name');
            }).map(function (guest) {
                return Y.Escape.html(guest.get('name').split(' ')[0]);
            });
        }
    });


    Y.Invitation = Y.Base.create('invitation', Y.Model, [Y.ModelSync.REST], {
        root: '/invitations/',

        initializer: function () {
            this.guests = new Y.Guests({bubbleTargets: this});
        },

        _setGuests: function (guests) {
            return this.guests.reset(guests);
        }
    }, {
        ATTRS: {
            guests: {setter: '_setGuests'}
        }
    });

    // -- Views ----------------------------------------------------------------

    Y.InvitationView = Y.Base.create('invitationView', Y.View, [], {
        events: {
            '[data-edit]'     : {click: 'edit'},
            '[data-done]'     : {click: 'done'},
            '[data-add-guest]': {click: 'addGuest'},
            '[data-attending]': {click: 'proposeUpdates'},
            'input, textarea' : {blur: 'proposeUpdates'}
        },

        initializer: function () {
            this.get('invitation').after('*:change', this.syncUI, this);
        },

        edit: function (e) {
            if (e) { e.preventDefault(); }
            this.get('container').addClass('is-inv-editing');
        },

        done: function (e) {
            var invitation = this.get('invitation');

            if (e) { e.preventDefault(); }
            this.get('container').removeClass('is-inv-editing');

            invitation.get('guests').plusones().each(function (guest) {
                if (!guest.get('name')) {
                    guest.set('is_attending', null);
                    this.getGuestNode(guest).addClass('guest-available');
                }
            }, this);

            this.proposeUpdates();
        },

        addGuest: function (e) {
            if (e) { e.preventDefault(); }

            this.get('container').all('.guest').removeClass('guest-available');
            this.get('invitation').get('guests').plusones()
                .invoke('set', 'is_attending', true);

            this.edit();
        },

        getGuestNode: function (guest) {
            var id = guest.get('id');
            return this.get('container').one('[data-guest="' + id + '"]');
        },

        proposeUpdates: function () {
            var container = this.get('container'),
                invitation;

            invitation = {
                address: container.one('[data-address]').get('value'),
                guests : []
            };

            container.all('[data-guest]').each(function (node) {
                invitation.guests.push({
                    id          : parseInt(node.getData('guest'), 10),
                    title       : node.one('[data-title]').get('value'),
                    name        : node.one('[data-name]').get('value'),
                    email       : node.one('[data-email]').get('value'),
                    is_attending: node.one('[data-attending]').get('checked')
                });
            });

            this.fire('invitationUpdate', {
                updates: invitation
            });
        },

        syncUI: function () {
            var container  = this.get('container'),
                invitation = this.get('invitation');

            container.all('address, [data-address]')
                .setHTML(Y.Escape.html(invitation.get('address')));

            invitation.get('guests').each(function (guest) {
                var node        = this.getGuestNode(guest),
                    isAttending = guest.get('is_attending');

                if (!node) { return; }

                node.toggleClass('is-guest-attending', isAttending);

                node.one('.guest-title').set('text', guest.get('title'));
                node.one('[data-title]').set('value', guest.get('title'));

                node.one('.guest-name').set('text', guest.get('name'));
                node.one('[data-name]').set('value', guest.get('name'));

                node.one('.guest-email').set('text', guest.get('email'));
                node.one('[data-email]').set('value', guest.get('email'));

                node.one('.guest-attending')
                    .set('text', isAttending ? 'Attending' : 'Not Attending');
                node.one('[data-attending]').set('checked', isAttending);
            }, this);
        }
    });


    Y.AnnouncementView = Y.Base.create('announcementView', Y.View, [], {
        namesSeparator : ' <span class="ann-sep">&amp;</span> ',
        attendingMsg   : 'Yay, We’re Happy You’ll Be Attending!',
        notAttendingMsg: 'We’re Sorry You Won’t Be Attending.',

        initializer: function () {
            this.get('guests').after('guest:change', this.syncUI, this);
        },

        syncUI: function () {
            var container = this.get('container'),
                guests    = this.get('guests'),
                attending = guests.attending(),
                names     = guests.names(attending.size() && attending),
                msg;

            container.one('.ann-primary')
                .setHTML(names.join(this.namesSeparator) + ',');

            msg = attending.size() ? this.attendingMsg : this.notAttendingMsg;
            container.one('.ann-secondary').setHTML(msg);
        }
    });


    Y.RsvpView = Y.Base.create('rsvpView', Y.View, [], {
        events: {
            '[data-attending]': {click: 'rsvp'}
        },

        rsvp: function (e) {
            var isAttending = e.currentTarget.getData('attending') === 'true';
            this.fire('rsvp', {isAttending: isAttending});
        }
    });


    Y.AttendingView = Y.Base.create('attendingView', Y.View, [], {
        initializer: function () {
            var container  = this.get('container'),
                invitation = this.get('invitation');

            this.announcementView = new Y.AnnouncementView({
                container    : container.one('.ann'),
                guests       : invitation.get('guests'),
                bubbleTargets: this
            }).attachEvents();

            this.invitationView = new Y.InvitationView({
                container    : container.one('.inv'),
                invitation   : invitation,
                bubbleTargets: this
            }).attachEvents();
        }
    });


    Y.NotAttendingView = Y.Base.create('notAttendingView', Y.View, [], {
        initializer: function () {
            this.invitationView = new Y.InvitationView({
                container    : this.get('container').one('.inv'),
                invitation   : this.get('invitation'),
                bubbleTargets: this
            }).attachEvents();
        }
    });

    // -- App ------------------------------------------------------------------

    var app = new Y.App({
        container      : '#main',
        viewContainer  : '#main',
        contentSelector: '#main',
        linkSelector   : null,

        transitions: true,
        root       : '/rsvp/',

        views: {
            rsvp        : {type: Y.RsvpView},
            attending   : {type: Y.AttendingView},
            notAttending: {type: Y.NotAttendingView}
        }
    });

    app.invitation     = new Y.Invitation(YUI.Env.LE.invitation);
    app.initialContent = Y.one('#main > [data-view]');

    app.rsvp = function (isAttending) {
        var invitation = this.invitation.set('rsvpd', true),
            guests     = invitation.get('guests');

        if (isAttending) {
            guests.invited().invoke('set', 'is_attending', true);
        } else {
            guests.invoke('set', 'is_attending', false);
        }

        return this.saveInvitation().then(function () {
            app.replace('');
        });
    };

    app.updateInvitation = function (updates) {
        updates || (updates = {});

        var invitation   = this.invitation,
            guests       = invitation.get('guests'),
            guestUpdates = updates.guests || [];

        delete updates.guests;
        invitation.setAttrs(updates);

        Y.Array.each(guestUpdates, function (gUpdates) {
            var guest = guests.getById(gUpdates.id);
            if (guest) {
                guest.setAttrs(gUpdates);
            }
        });

        return this.saveInvitation();
    };

    app.saveInvitation = function () {
        var invitation = this.invitation,
            guests     = invitation.get('guests'),
            saves      = [];

        saves.push(invitation.isModified() && invitation.promiseSave());
        saves.push.apply(saves, guests.map(function (guest) {
            return guest.isModified() && guest.promiseSave();
        }));

        return Y.batch.apply(null, saves);
    },

    app.route('/', 'loadContent', function (req, res, next) {
        var content = res.content.node.one('[data-view]');

        this.once('activeViewChange', function (e) {
            if (this.invitation.get('guests').attending().size()) {
                e.newVal.invitationView.edit();
            }
        });

        this.showContent(content, {
            view: {
                name  : content.getData('view'),
                config: {invitation: this.invitation}
            }
        });
    });

    app.on('*:rsvp', function (e) {
        this.rsvp(e.isAttending);
    });

    app.on('*:invitationUpdate', function (e) {
        this.updateInvitation(e.updates);
    });

    app.render().showContent(app.initialContent, {
        transition: false,

        view: {
            name  : app.initialContent.getData('view'),
            config: {invitation: app.invitation}
        }
    });

}, '1.3.2', {
    requires: [
        'le-main',
        'app-base',
        'app-content',
        'app-transitions',
        'escape',
        'event-focus',
        'io-queue',
        'model',
        'model-list',
        'model-sync-rest',
        'view',
        'promise'
    ]
});