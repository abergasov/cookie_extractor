run:
	@for i in {1..100}; do \
		echo "Iteration $$i"; \
		yarn run dev; \
		sleep 60; \
	done